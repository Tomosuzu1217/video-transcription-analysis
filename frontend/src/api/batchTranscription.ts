import { get, getAllByIndex, put, del, update, generateId, STORES } from "../services/db";
import { downloadVideoAsBlob } from "../services/videoStorage";
import { supabase } from "../services/supabase";
import { transcribeMediaWithKey, isRateLimitError } from "../services/gemini";
import { KeyPool } from "../services/keyPool";
import type { BatchProgress, VideoProgress, VideoTranscriptionStage, VideoRecord, TranscriptionRecord } from "../types";

/** Strip API keys and sensitive data from error messages */
function sanitizeError(e: unknown): string {
  let msg = String(e);
  // Remove API key patterns (AIza..., sk-..., key=...)
  msg = msg.replace(/AIza[A-Za-z0-9_-]{30,}/g, "API_KEY_REDACTED");
  msg = msg.replace(/sk-[A-Za-z0-9]{20,}/g, "API_KEY_REDACTED");
  msg = msg.replace(/key=[A-Za-z0-9_-]{20,}/gi, "key=REDACTED");
  // Remove Bearer tokens
  msg = msg.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED");
  return msg.slice(0, 500);
}

async function logOperation(
  videoId: number,
  operation: string,
  status: "start" | "success" | "error",
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await put(STORES.TRANSCRIPTION_LOGS, {
      id: logId,
      video_id: videoId,
      operation,
      status,
      details: details ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch {
    console.warn("Failed to write log entry");
  }
}

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
    videoProgress.set(id, { videoId: id, filename: "", stage: "queued" });
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
): Promise<"success" | "rate_limited" | "error" | "skipped"> {
  const { keyPool } = state;

  try {
    setVideoStage(state, videoId, "downloading", {
      startedAt: Date.now(),
      apiKeyIndex: keyInfo.index,
    });

    await logOperation(videoId, "transcribe", "start", { keyIndex: keyInfo.index });

    // Optimistic lock: allow if not transcribing, OR if stuck transcribing (>5 min)
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let lockedVideo: any = null;

    // First try: non-transcribing videos
    const { data: d1 } = await supabase
      .from("videos")
      .update({ status: "transcribing", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", videoId)
      .neq("status", "transcribing")
      .select()
      .maybeSingle();
    lockedVideo = d1;

    // Second try: stale transcribing videos (stuck for >5 min)
    if (!lockedVideo) {
      const { data: d2 } = await supabase
        .from("videos")
        .update({ status: "transcribing", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", videoId)
        .eq("status", "transcribing")
        .lt("updated_at", staleThreshold)
        .select()
        .maybeSingle();
      lockedVideo = d2;
    }

    if (!lockedVideo) {
      // Another user is actively transcribing this video
      keyPool.release(keyInfo.index);
      setVideoStage(state, videoId, "completed", { completedAt: Date.now() });
      state.progress.completedVideos++;
      return "skipped";
    }

    const videoData = lockedVideo as VideoRecord;
    const vp = state.progress.videoProgress.get(videoId);
    if (vp) {
      vp.filename = videoData.filename ?? "unknown";
      vp.fileSizeBytes = videoData.file_size ?? undefined;
      vp.durationSeconds = videoData.duration_seconds ?? undefined;
    }

    // Download from Supabase Storage
    const fileSizeMB = videoData.file_size ? (videoData.file_size / 1024 / 1024).toFixed(1) : "?";
    setVideoStage(state, videoId, "downloading", {
      detail: `Storageからダウンロード中 (${fileSizeMB} MB)`,
    });
    const blob = await downloadVideoAsBlob(videoData.storage_path);
    const file = new File([blob], videoData.filename, { type: blob.type || "video/mp4" });

    setVideoStage(state, videoId, "preparing", {
      detail: `Base64エンコード中 (${fileSizeMB} MB)`,
    });

    setVideoStage(state, videoId, "transcribing", {
      detail: `Gemini APIにリクエスト送信中...`,
    });

    const startTime = Date.now();

    // Update detail periodically while waiting for AI
    const aiTimer = setInterval(() => {
      const sec = Math.round((Date.now() - startTime) / 1000);
      setVideoStage(state, videoId, "transcribing", {
        detail: `AI処理中... (${sec}秒経過)`,
      });
    }, 2000);

    let result: { full_text: string; language: string; segments: { start_time: number; end_time: number; text: string }[] };
    try {
      result = await transcribeMediaWithKey(file, keyInfo.key, keyPool.getModel());
    } finally {
      clearInterval(aiTimer);
    }
    const processingTime = (Date.now() - startTime) / 1000;

    const segCount = result.segments?.length ?? 0;
    setVideoStage(state, videoId, "saving", {
      detail: `書き起こし結果を保存中 (${segCount}セグメント)`,
    });

    // Delete old transcriptions
    const oldTranscriptions = await getAllByIndex<TranscriptionRecord>(STORES.TRANSCRIPTIONS, "video_id", videoId);
    if (oldTranscriptions.length > 0) {
      setVideoStage(state, videoId, "saving", {
        detail: `旧データ削除中 → 新規保存 (${segCount}セグメント)`,
      });
      for (const t of oldTranscriptions) {
        await del(STORES.TRANSCRIPTIONS, t.id);
      }
    }

    // Save new transcription
    const tId = generateId();
    await put(STORES.TRANSCRIPTIONS, {
      id: tId,
      video_id: videoId,
      full_text: result.full_text,
      language: result.language,
      model_used: keyPool.getModel(),
      processing_time_seconds: Math.round(processingTime * 10) / 10,
      segments: result.segments,
      created_at: new Date().toISOString(),
    });

    setVideoStage(state, videoId, "saving", {
      detail: `動画ステータス更新中...`,
    });
    await update(STORES.VIDEOS, videoId, {
      status: "transcribed",
      updated_at: new Date().toISOString(),
    });

    setVideoStage(state, videoId, "completed", {
      completedAt: Date.now(),
      detail: `完了 (${Math.round(processingTime)}秒, ${segCount}セグメント)`,
    });
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
      setVideoStage(state, videoId, "queued", { apiKeyIndex: undefined, detail: `Key#${keyInfo.index + 1} レート制限 → 再キュー` });
      await logOperation(videoId, "transcribe", "error", { keyIndex: keyInfo.index, error: "rate_limited" });
      return "rate_limited";
    }

    keyPool.release(keyInfo.index);
    const safeMsg = sanitizeError(e);
    setVideoStage(state, videoId, "error", { error: safeMsg, detail: safeMsg });
    state.progress.errorVideos++;

    await update(STORES.VIDEOS, videoId, {
      status: "error",
      error_message: safeMsg,
      updated_at: new Date().toISOString(),
    });

    await logOperation(videoId, "transcribe", "error", { keyIndex: keyInfo.index, error: safeMsg });
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
      const videoData = await get<VideoRecord>(STORES.VIDEOS, id);
      if (videoData) {
        const vp = state.progress.videoProgress.get(id);
        if (vp) vp.filename = videoData.filename ?? "unknown";
      }
    } catch { /* ignore */ }
  }

  notifyProgress(state);

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
