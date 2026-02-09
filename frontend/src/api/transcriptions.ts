import { get, getAll, getAllByIndex, put, del, update, generateId, STORES } from "../services/db";
import { supabase } from "../services/supabase";
import { downloadVideoAsBlob } from "../services/videoStorage";
import { transcribeMedia } from "../services/gemini";
import { getCurrentBatchProgress, startBatchTranscription, isBatchRunning } from "./batchTranscription";
import type { TranscriptionStatus, Transcription, TranscriptionSegment, BatchProgress, VideoRecord, TranscriptionRecord } from "../types";

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

export async function getTranscriptionStatus(videoId: number): Promise<TranscriptionStatus> {
  const videoData = await get<VideoRecord>(STORES.VIDEOS, videoId);
  if (!videoData) throw new Error("動画が見つかりません");

  const tRecords = await getAllByIndex<TranscriptionRecord>(STORES.TRANSCRIPTIONS, "video_id", videoId);

  let transcription: Transcription | null = null;
  if (tRecords.length > 0) {
    const tData = tRecords[0];
    const segments: TranscriptionSegment[] = (tData.segments ?? []).map((s: any, i: number) => ({
      id: i + 1,
      start_time: s.start_time,
      end_time: s.end_time,
      text: s.text,
    }));
    transcription = {
      id: tData.id,
      video_id: videoId,
      full_text: tData.full_text ?? "",
      language: tData.language ?? "ja",
      model_used: tData.model_used ?? null,
      processing_time_seconds: tData.processing_time_seconds ?? null,
      edited: tData.edited ?? false,
      edited_at: tData.edited_at ?? null,
      created_at: tData.created_at ?? "",
      segments,
    };
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
  const videoData = await get<VideoRecord>(STORES.VIDEOS, videoId);
  if (!videoData) throw new Error("動画が見つかりません");

  // Optimistic lock: only update if not already transcribing
  const { data: lockedVideo, error: lockError } = await supabase
    .from("videos")
    .update({ status: "transcribing", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", videoId)
    .neq("status", "transcribing")
    .select()
    .maybeSingle();

  if (lockError) throw lockError;
  if (!lockedVideo) throw new Error("別のユーザーが書き起こし中です");

  try {
    // Download from Supabase Storage
    const blob = await downloadVideoAsBlob(videoData.storage_path);
    const file = new File([blob], videoData.filename, { type: blob.type || "video/mp4" });

    const startTime = Date.now();
    const result = await transcribeMedia(file);
    const processingTime = (Date.now() - startTime) / 1000;

    // Delete old transcriptions
    const old = await getAllByIndex<TranscriptionRecord>(STORES.TRANSCRIPTIONS, "video_id", videoId);
    for (const t of old) await del(STORES.TRANSCRIPTIONS, t.id);

    // Save new transcription
    const tId = generateId();
    await put(STORES.TRANSCRIPTIONS, {
      id: tId,
      video_id: videoId,
      full_text: result.full_text,
      language: result.language,
      model_used: "gemini",
      processing_time_seconds: Math.round(processingTime * 10) / 10,
      segments: result.segments,
      created_at: new Date().toISOString(),
    });

    await update(STORES.VIDEOS, videoId, { status: "transcribed", updated_at: new Date().toISOString() });
  } catch (e) {
    // Sanitize error message to avoid leaking API keys
    let safeMsg = String(e);
    safeMsg = safeMsg.replace(/AIza[A-Za-z0-9_-]{30,}/g, "API_KEY_REDACTED");
    safeMsg = safeMsg.replace(/sk-[A-Za-z0-9]{20,}/g, "API_KEY_REDACTED");
    safeMsg = safeMsg.replace(/key=[A-Za-z0-9_-]{20,}/gi, "key=REDACTED");
    safeMsg = safeMsg.slice(0, 500);

    await update(STORES.VIDEOS, videoId, {
      status: "error",
      error_message: safeMsg,
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

export async function searchTranscriptions(
  queryStr: string,
): Promise<{ query: string; total: number; results: SearchResult[] }> {
  const allTranscriptions = await getAll<TranscriptionRecord>(STORES.TRANSCRIPTIONS);
  const results: SearchResult[] = [];
  const lowerQuery = queryStr.toLowerCase();

  for (const tData of allTranscriptions) {
    const videoId = tData.video_id;
    const videoData = await get<VideoRecord>(STORES.VIDEOS, videoId);
    const videoFilename = videoData?.filename ?? "unknown";

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
  const allTranscriptions = await getAll<TranscriptionRecord>(STORES.TRANSCRIPTIONS);
  const transcriptions: FullTranscription[] = [];

  for (const tData of allTranscriptions) {
    const videoId = tData.video_id;
    const videoData = await get<VideoRecord>(STORES.VIDEOS, videoId);
    const filename = videoData?.filename ?? "unknown";
    const duration = videoData?.duration_seconds ?? null;

    const segments = (tData.segments ?? []).map((s: any, i: number) => ({
      id: i + 1,
      start_time: s.start_time,
      end_time: s.end_time,
      text: s.text,
    }));

    transcriptions.push({
      video_id: videoId,
      video_filename: filename,
      duration_seconds: duration,
      full_text: tData.full_text ?? "",
      language: tData.language ?? "ja",
      segments,
    });
  }

  return { total: transcriptions.length, transcriptions };
}

const MAX_SEGMENT_TEXT_LENGTH = 10000;

export async function updateTranscriptionSegment(
  videoId: number,
  segmentIndex: number,
  newText: string,
): Promise<void> {
  if (newText.length > MAX_SEGMENT_TEXT_LENGTH) {
    throw new Error(`テキストが長すぎます（上限: ${MAX_SEGMENT_TEXT_LENGTH}文字）`);
  }

  const tRecords = await getAllByIndex<TranscriptionRecord>(STORES.TRANSCRIPTIONS, "video_id", videoId);
  if (tRecords.length === 0) throw new Error("書き起こしが見つかりません");

  const tData = tRecords[0];
  const segments = [...(tData.segments ?? [])];
  if (segmentIndex < 0 || segmentIndex >= segments.length) throw new Error("セグメントが見つかりません");

  segments[segmentIndex] = { ...segments[segmentIndex], text: newText };
  const fullText = segments.map((s) => s.text).join("\n");

  await supabase
    .from("transcriptions")
    .update({
      segments,
      full_text: fullText,
      edited: true,
      edited_at: new Date().toISOString(),
    })
    .eq("id", tData.id);
}
