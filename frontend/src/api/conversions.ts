import { get, getAll, getAllByIndex, put, del, update, generateId, STORES } from "../services/db";
import type { Conversion, ConversionSummary, VideoRecord } from "../types";

export async function createConversion(data: {
  video_id: number;
  metric_name: string;
  metric_value: number;
  date_recorded?: string;
  notes?: string;
}): Promise<Conversion> {
  // Input validation
  if (!data.metric_name || data.metric_name.trim().length === 0) {
    throw new Error("指標名は必須です");
  }
  if (data.metric_name.length > 200) {
    throw new Error("指標名が長すぎます（上限: 200文字）");
  }
  if (!isFinite(data.metric_value)) {
    throw new Error("指標値が無効です");
  }
  if (data.notes && data.notes.length > 2000) {
    throw new Error("メモが長すぎます（上限: 2000文字）");
  }

  const id = generateId();
  const now = new Date().toISOString();
  const convData: Conversion = {
    id,
    video_id: data.video_id,
    metric_name: data.metric_name,
    metric_value: data.metric_value,
    date_recorded: data.date_recorded ?? null,
    notes: data.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await put(STORES.CONVERSIONS, convData);
  return convData;
}

export async function getConversions(videoId?: number): Promise<Conversion[]> {
  if (videoId) {
    return getAllByIndex<Conversion>(STORES.CONVERSIONS, "video_id", videoId);
  }
  return getAll<Conversion>(STORES.CONVERSIONS);
}

export async function updateConversion(
  id: number,
  data: Partial<{ metric_name: string; metric_value: number; date_recorded: string; notes: string }>,
): Promise<Conversion> {
  const updated = await update<Conversion>(STORES.CONVERSIONS, id, {
    ...data,
    updated_at: new Date().toISOString(),
  } as Partial<Conversion>);
  return updated;
}

export async function deleteConversion(id: number): Promise<void> {
  await del(STORES.CONVERSIONS, id);
}

export async function getConversionSummary(): Promise<ConversionSummary[]> {
  const allConversions = await getAll<Conversion>(STORES.CONVERSIONS);
  const byVideo = new Map<number, { metrics: Record<string, number>; filename: string }>();

  for (const conv of allConversions) {
    const vid = conv.video_id;
    if (!byVideo.has(vid)) byVideo.set(vid, { metrics: {}, filename: "" });
    const entry = byVideo.get(vid)!;
    entry.metrics[conv.metric_name] = conv.metric_value;
  }

  // Get filenames
  for (const [vid, entry] of byVideo) {
    const videoData = await get<VideoRecord>(STORES.VIDEOS, vid);
    entry.filename = videoData?.filename ?? "unknown";
  }

  return Array.from(byVideo.entries()).map(([vid, entry]) => ({
    video_id: vid,
    video_filename: entry.filename,
    metrics: entry.metrics,
  }));
}
