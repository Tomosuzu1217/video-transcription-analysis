import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where,
} from "firebase/firestore";
import { transcribeMedia } from "../services/gemini";
import { getCurrentBatchProgress, startBatchTranscription, isBatchRunning } from "./batchTranscription";
import type { TranscriptionStatus, Transcription, TranscriptionSegment, BatchProgress } from "../types";

export interface QueueStatus {
  model_loaded: boolean;
  model_loading: boolean;
  queue_size: number;
  queue_video_ids: number[];
  current_video_id: number | null;
  current_step: string;
  current_elapsed_seconds: number | null;
}

export interface SearchResult {
  video_id: number;
  video_filename: string;
  segment_id: number;
  start_time: number;
  end_time: number;
  text: string;
}

export interface TranscriptionSegmentData {
  id: number;
  start_time: number;
  end_time: number;
  text: string;
}

export interface FullTranscription {
  video_id: number;
  video_filename: string;
  duration_seconds: number | null;
  full_text: string;
  language: string;
  segments: TranscriptionSegmentData[];
}

// Store transcription data cache for export
const _transcriptionDataCache = new Map<number, { full_text: string; segments: TranscriptionSegmentData[]; filename: string }>();

export async function getTranscriptionStatus(videoId: number): Promise<TranscriptionStatus> {
  // Check video status
  const videoSnap = await getDoc(doc(db, "videos", String(videoId)));
  if (!videoSnap.exists()) throw new Error("動画が見つかりません");
  const videoData = videoSnap.data();

  // Check for transcription
  const q = query(collection(db, "transcriptions"), where("videoId", "==", videoId));
  const tSnap = await getDocs(q);

  let transcription: Transcription | null = null;
  if (!tSnap.empty) {
    const tDoc = tSnap.docs[0];
    const tData = tDoc.data();
    const segments: TranscriptionSegment[] = (tData.segments ?? []).map((s: any, i: number) => ({
      id: i + 1,
      start_time: s.start_time,
      end_time: s.end_time,
      text: s.text,
    }));
    transcription = {
      id: tData.id ?? parseInt(tDoc.id),
      video_id: videoId,
      full_text: tData.full_text ?? "",
      language: tData.language ?? "ja",
      model_used: tData.model_used ?? null,
      processing_time_seconds: tData.processing_time_seconds ?? null,
      created_at: tData.created_at ?? "",
      segments,
    };
    // Cache for export
    _transcriptionDataCache.set(videoId, {
      full_text: transcription.full_text,
      segments: segments.map((s) => ({ id: s.id, start_time: s.start_time, end_time: s.end_time, text: s.text })),
      filename: videoData.filename ?? "video",
    });
  }

  const statusMap: Record<string, TranscriptionStatus["status"]> = {
    uploaded: "pending",
    transcribing: "transcribing",
    transcribed: "completed",
    error: "error",
  };

  return {
    video_id: videoId,
    status: statusMap[videoData.status] ?? "pending",
    transcription,
  };
}

export async function retryTranscription(videoId: number): Promise<void> {
  // Get video data
  const videoSnap = await getDoc(doc(db, "videos", String(videoId)));
  if (!videoSnap.exists()) throw new Error("動画が見つかりません");
  const videoData = videoSnap.data();

  // Set status to transcribing
  await updateDoc(doc(db, "videos", String(videoId)), { status: "transcribing", error_message: null, updated_at: new Date().toISOString() });

  try {
    // Fetch the file from storage
    const url = videoData.storage_url;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`動画のダウンロードに失敗しました (HTTP ${response.status})`);
    const blob = await response.blob();
    const file = new File([blob], videoData.filename, { type: blob.type || "video/mp4" });

    const startTime = Date.now();
    const result = await transcribeMedia(file);
    const processingTime = (Date.now() - startTime) / 1000;

    // Delete old transcription
    const oldQ = query(collection(db, "transcriptions"), where("videoId", "==", videoId));
    const oldSnap = await getDocs(oldQ);
    for (const d of oldSnap.docs) {
      await deleteDoc(d.ref);
    }

    // Save new transcription
    const tId = Date.now();
    await setDoc(doc(db, "transcriptions", String(tId)), {
      id: tId,
      videoId,
      full_text: result.full_text,
      language: result.language,
      model_used: "gemini",
      processing_time_seconds: Math.round(processingTime * 10) / 10,
      segments: result.segments,
      created_at: new Date().toISOString(),
    });

    await updateDoc(doc(db, "videos", String(videoId)), { status: "transcribed", updated_at: new Date().toISOString() });
  } catch (e) {
    await updateDoc(doc(db, "videos", String(videoId)), {
      status: "error",
      error_message: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    });
    throw e;
  }
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const batch = getCurrentBatchProgress();
  if (!batch) {
    return {
      model_loaded: true,
      model_loading: false,
      queue_size: 0,
      queue_video_ids: [],
      current_video_id: null,
      current_step: "",
      current_elapsed_seconds: null,
    };
  }

  const workingVideo = Array.from(batch.videoProgress.values())
    .find((vp) => vp.stage === "transcribing" || vp.stage === "downloading" || vp.stage === "preparing");

  const queuedIds = Array.from(batch.videoProgress.values())
    .filter((vp) => vp.stage === "queued")
    .map((vp) => vp.videoId);

  return {
    model_loaded: true,
    model_loading: false,
    queue_size: queuedIds.length,
    queue_video_ids: queuedIds,
    current_video_id: workingVideo?.videoId ?? null,
    current_step: workingVideo?.stage ?? "",
    current_elapsed_seconds: workingVideo?.startedAt
      ? Math.round((Date.now() - workingVideo.startedAt) / 1000)
      : null,
  };
}

export async function batchTranscribeVideos(
  videoIds: number[],
  onProgress: (progress: BatchProgress) => void,
): Promise<{ cancel: () => void }> {
  return startBatchTranscription(videoIds, onProgress);
}

export { isBatchRunning };

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatVtt(seconds: number): string {
  return formatTime(seconds).replace(",", ".");
}

function generateExportContent(
  data: { full_text: string; segments: TranscriptionSegmentData[]; filename: string },
  format: string,
): string {
  switch (format) {
    case "txt":
      return data.full_text;
    case "srt":
      return data.segments.map((s, i) =>
        `${i + 1}\n${formatTime(s.start_time)} --> ${formatTime(s.end_time)}\n${s.text}\n`
      ).join("\n");
    case "vtt":
      return "WEBVTT\n\n" + data.segments.map((s) =>
        `${formatVtt(s.start_time)} --> ${formatVtt(s.end_time)}\n${s.text}\n`
      ).join("\n");
    case "json":
      return JSON.stringify({ full_text: data.full_text, segments: data.segments }, null, 2);
    default:
      return data.full_text;
  }
}

export function getTranscriptionExportUrl(videoId: number, format: "txt" | "srt" | "vtt" | "json"): string {
  const cached = _transcriptionDataCache.get(videoId);
  if (!cached) return "#";
  const content = generateExportContent(cached, format);
  const encoded = encodeURIComponent(content);
  const mimeType = format === "json" ? "application/json" : "text/plain";
  return `data:${mimeType};charset=utf-8,${encoded}`;
}

export async function searchTranscriptions(
  queryStr: string,
): Promise<{ query: string; total: number; results: SearchResult[] }> {
  // Client-side search across all transcriptions
  const tSnap = await getDocs(collection(db, "transcriptions"));
  const results: SearchResult[] = [];
  const lowerQuery = queryStr.toLowerCase();

  for (const tDoc of tSnap.docs) {
    const tData = tDoc.data();
    const videoId = tData.videoId;
    // Get video filename
    const vSnap = await getDoc(doc(db, "videos", String(videoId)));
    const videoFilename = vSnap.exists() ? vSnap.data().filename : "unknown";

    const segments = tData.segments ?? [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.text && seg.text.toLowerCase().includes(lowerQuery)) {
        results.push({
          video_id: videoId,
          video_filename: videoFilename,
          segment_id: i + 1,
          start_time: seg.start_time,
          end_time: seg.end_time,
          text: seg.text,
        });
      }
    }
  }

  return { query: queryStr, total: results.length, results };
}

export async function getAllTranscriptions(): Promise<{
  total: number;
  transcriptions: FullTranscription[];
}> {
  const tSnap = await getDocs(collection(db, "transcriptions"));
  const transcriptions: FullTranscription[] = [];

  for (const tDoc of tSnap.docs) {
    const tData = tDoc.data();
    const videoId = tData.videoId;
    const vSnap = await getDoc(doc(db, "videos", String(videoId)));
    const vData = vSnap.exists() ? vSnap.data() : { filename: "unknown", duration_seconds: null };

    const segments = (tData.segments ?? []).map((s: any, i: number) => ({
      id: i + 1,
      start_time: s.start_time,
      end_time: s.end_time,
      text: s.text,
    }));

    // Cache for export
    _transcriptionDataCache.set(videoId, {
      full_text: tData.full_text ?? "",
      segments,
      filename: vData.filename ?? "video",
    });

    transcriptions.push({
      video_id: videoId,
      video_filename: vData.filename ?? "unknown",
      duration_seconds: vData.duration_seconds ?? null,
      full_text: tData.full_text ?? "",
      language: tData.language ?? "ja",
      segments,
    });
  }

  return { total: transcriptions.length, transcriptions };
}
