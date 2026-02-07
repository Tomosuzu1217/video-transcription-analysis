import { db } from "../firebase";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, query, where,
} from "firebase/firestore";
import { transcribeMediaWithKey, isRateLimitError } from "../services/gemini";
import { KeyPool } from "../services/keyPool";
import type { BatchProgress, VideoProgress, VideoTranscriptionStage } from "../types";

// --- Logging helper ---
async function logOperation(
  videoId: number,
  operation: string,
  status: "start" | "success" | "error",
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, "transcription_logs", logId), {
      videoId,
      operation,
      status,
      details: details ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.warn("Failed to write log entry");
  }
}

// --- Batch state singleton ---
let _currentBatch: BatchState | null = null;

interface BatchState {
  queue: number[];
  keyPool: KeyPool;
  progress: BatchProgress;
  onProgressUpdate: (progress: BatchProgress) => void;
  cancelRequested: boolean;
  completionTimestamps: number[];
}

function createInitialProgress(videoIds: number[], keyCount: number): BatchProgress {
  const videoProgress = new Map<number, VideoProgress>();
  for (const id of videoIds) {
    videoProgress.set(id, {
      videoId: id,
      filename: "",
      stage: "queued",
    });
  }
  return {
    totalVideos: videoIds.length,
    completedVideos: 0,
    errorVideos: 0,
    activeWorkers: 0,
    totalWorkers: keyCount,
    videoProgress,
    keyStatuses: [],
    startedAt: Date.now(),
    avgSecondsPerVideo: null,
    estimatedSecondsRemaining: null,
    isRunning: true,
    isCancelled: false,
  };
}

function updateProgressMetrics(state: BatchState): void {
  const p = state.progress;
  const { completionTimestamps } = state;

  if (completionTimestamps.length >= 2) {
    const elapsed = (completionTimestamps[completionTimestamps.length - 1] - completionTimestamps[0]) / 1000;
    const count = completionTimestamps.length - 1;
    p.avgSecondsPerVideo = Math.round((elapsed / count) * 10) / 10;
  } else if (completionTimestamps.length === 1) {
    p.avgSecondsPerVideo = Math.round(((completionTimestamps[0] - p.startedAt) / 1000) * 10) / 10;
  }

  const remaining = p.totalVideos - p.completedVideos - p.errorVideos;
  if (p.avgSecondsPerVideo && remaining > 0) {
    const activeWorkers = Math.max(1, p.activeWorkers);
    p.estimatedSecondsRemaining = Math.round((remaining / activeWorkers) * p.avgSecondsPerVideo);
  } else {
    p.estimatedSecondsRemaining = null;
  }

  p.keyStatuses = state.keyPool.getStatuses();
}

function notifyProgress(state: BatchState): void {
  updateProgressMetrics(state);
  state.onProgressUpdate({
    ...state.progress,
    videoProgress: new Map(state.progress.videoProgress),
  });
}

function setVideoStage(
  state: BatchState,
  videoId: number,
  stage: VideoTranscriptionStage,
  extra?: Partial<VideoProgress>,
): void {
  const vp = state.progress.videoProgress.get(videoId);
  if (vp) {
    vp.stage = stage;
    if (extra) Object.assign(vp, extra);
  }
  notifyProgress(state);
}

async function processVideo(
  state: BatchState,
  videoId: number,
  keyInfo: { key: string; index: number },
): Promise<"success" | "rate_limited" | "error"> {
  const { keyPool } = state;

  try {
    setVideoStage(state, videoId, "downloading", {
      startedAt: Date.now(),
      apiKeyIndex: keyInfo.index,
    });

    await logOperation(videoId, "transcribe", "start", { keyIndex: keyInfo.index });

    await updateDoc(doc(db, "videos", String(videoId)), {
      status: "transcribing",
      error_message: null,
      updated_at: new Date().toISOString(),
    });

    const videoSnap = await getDoc(doc(db, "videos", String(videoId)));
    if (!videoSnap.exists()) throw new Error("動画が見つかりません");
    const videoData = videoSnap.data();

    const vp = state.progress.videoProgress.get(videoId);
    if (vp) vp.filename = videoData.filename ?? "unknown";

    const response = await fetch(videoData.storage_url);
    if (!response.ok) throw new Error(`動画のダウンロードに失敗しました (HTTP ${response.status})`);
    const blob = await response.blob();
    const file = new File([blob], videoData.filename, { type: blob.type || "video/mp4" });

    setVideoStage(state, videoId, "preparing");

    setVideoStage(state, videoId, "transcribing");

    const startTime = Date.now();
    const result = await transcribeMediaWithKey(file, keyInfo.key, keyPool.getModel());
    const processingTime = (Date.now() - startTime) / 1000;

    setVideoStage(state, videoId, "saving");

    // Delete old transcription if exists
    const oldQ = query(collection(db, "transcriptions"), where("videoId", "==", videoId));
    const oldSnap = await getDocs(oldQ);
    for (const d of oldSnap.docs) {
      await deleteDoc(d.ref);
    }

    // Save new transcription
    const tId = Date.now() + Math.floor(Math.random() * 1000);
    await setDoc(doc(db, "transcriptions", String(tId)), {
      id: tId,
      videoId,
      full_text: result.full_text,
      language: result.language,
      model_used: keyPool.getModel(),
      processing_time_seconds: Math.round(processingTime * 10) / 10,
      segments: result.segments,
      created_at: new Date().toISOString(),
    });

    await updateDoc(doc(db, "videos", String(videoId)), {
      status: "transcribed",
      updated_at: new Date().toISOString(),
    });

    setVideoStage(state, videoId, "completed", { completedAt: Date.now() });
    state.progress.completedVideos++;
    state.completionTimestamps.push(Date.now());

    await logOperation(videoId, "transcribe", "success", {
      keyIndex: keyInfo.index,
      processingTime: Math.round(processingTime * 10) / 10,
    });

    keyPool.release(keyInfo.index);
    return "success";

  } catch (e) {
    if (isRateLimitError(e)) {
      keyPool.markRateLimited(keyInfo.index);
      setVideoStage(state, videoId, "queued", { apiKeyIndex: undefined });
      await logOperation(videoId, "transcribe", "error", {
        keyIndex: keyInfo.index,
        error: "rate_limited",
      });
      return "rate_limited";
    }

    keyPool.release(keyInfo.index);
    setVideoStage(state, videoId, "error", { error: String(e).slice(0, 500) });
    state.progress.errorVideos++;

    await updateDoc(doc(db, "videos", String(videoId)), {
      status: "error",
      error_message: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    });

    await logOperation(videoId, "transcribe", "error", {
      keyIndex: keyInfo.index,
      error: String(e).slice(0, 500),
    });

    return "error";
  }
}

async function workerLoop(state: BatchState): Promise<void> {
  state.progress.activeWorkers++;
  notifyProgress(state);

  while (!state.cancelRequested) {
    const videoId = state.queue.shift();
    if (videoId === undefined) break;

    let keyInfo = state.keyPool.acquire(videoId);

    while (!keyInfo && !state.cancelRequested) {
      if (!state.keyPool.hasAvailableOrCoolingKeys()) {
        state.queue.unshift(videoId);
        state.progress.activeWorkers--;
        notifyProgress(state);
        return;
      }
      state.progress.activeWorkers--;
      notifyProgress(state);
      const available = await state.keyPool.waitForAvailable();
      state.progress.activeWorkers++;
      notifyProgress(state);
      if (!available) {
        state.queue.unshift(videoId);
        state.progress.activeWorkers--;
        notifyProgress(state);
        return;
      }
      keyInfo = state.keyPool.acquire(videoId);
    }

    if (state.cancelRequested || !keyInfo) {
      if (videoId !== undefined) state.queue.unshift(videoId);
      if (keyInfo) state.keyPool.release(keyInfo.index);
      break;
    }

    const result = await processVideo(state, videoId, keyInfo);

    if (result === "rate_limited") {
      state.queue.unshift(videoId);
    }
  }

  state.progress.activeWorkers--;
  notifyProgress(state);
}

export async function startBatchTranscription(
  videoIds: number[],
  onProgress: (progress: BatchProgress) => void,
): Promise<{ cancel: () => void }> {
  if (_currentBatch && _currentBatch.progress.isRunning) {
    throw new Error("バッチ処理が既に実行中です");
  }

  const keyPool = new KeyPool();
  await keyPool.initialize();

  if (keyPool.getKeyCount() === 0) {
    throw new Error("APIキーが設定されていません。設定画面からAPIキーを追加してください。");
  }

  const state: BatchState = {
    queue: [...videoIds],
    keyPool,
    progress: createInitialProgress(videoIds, keyPool.getKeyCount()),
    onProgressUpdate: onProgress,
    cancelRequested: false,
    completionTimestamps: [],
  };

  _currentBatch = state;

  // Pre-load filenames
  for (const id of videoIds) {
    try {
      const snap = await getDoc(doc(db, "videos", String(id)));
      if (snap.exists()) {
        const vp = state.progress.videoProgress.get(id);
        if (vp) vp.filename = snap.data().filename ?? "unknown";
      }
    } catch { /* ignore */ }
  }

  notifyProgress(state);

  // Spawn workers (one per key)
  const workerCount = keyPool.getKeyCount();
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(workerLoop(state));
  }

  Promise.all(workers).then(() => {
    state.progress.isRunning = false;
    notifyProgress(state);
    _currentBatch = null;
  }).catch((err) => {
    console.error("Batch worker error:", err);
    state.progress.isRunning = false;
    notifyProgress(state);
    _currentBatch = null;
  });

  return {
    cancel: () => {
      state.cancelRequested = true;
      state.progress.isCancelled = true;
      notifyProgress(state);
    },
  };
}

export function getCurrentBatchProgress(): BatchProgress | null {
  if (!_currentBatch) return null;
  return {
    ..._currentBatch.progress,
    videoProgress: new Map(_currentBatch.progress.videoProgress),
  };
}

export function isBatchRunning(): boolean {
  return _currentBatch !== null && _currentBatch.progress.isRunning;
}
