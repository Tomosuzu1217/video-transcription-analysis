import { get, getAll, put, del, update, generateId, STORES } from "../services/db";
import { saveVideo as uploadToStorage, getVideoSignedUrl, deleteVideo as deleteFromStorage } from "../services/videoStorage";
import type { Video } from "../types";

export interface UploadResult {
  successes: Video[];
  errors: { filename: string; error: string }[];
}

/** Supabase Storage free tier: 50MB per file */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = file.type.startsWith("audio/")
      ? document.createElement("audio")
      : document.createElement("video");
    el.preload = "metadata";
    const cleanup = () => { URL.revokeObjectURL(el.src); };
    const timeout = setTimeout(() => { cleanup(); resolve(null); }, 10000);
    el.onloadedmetadata = () => {
      clearTimeout(timeout);
      const d = isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : null;
      cleanup();
      resolve(d);
    };
    el.onerror = () => { clearTimeout(timeout); cleanup(); resolve(null); };
    el.src = URL.createObjectURL(file);
  });
}

// Signed URL cache with expiry
const _signedUrlCache = new Map<number, { url: string; expiresAt: number }>();

export async function uploadVideos(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const successes: Video[] = [];
  const errors: { filename: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // File size validation
    if (file.size > MAX_FILE_SIZE) {
      errors.push({
        filename: file.name,
        error: `ファイルサイズが上限(50MB)を超えています: ${(file.size / (1024 * 1024)).toFixed(1)}MB`,
      });
      if (onProgress) onProgress(Math.round(((i + 1) / files.length) * 100));
      continue;
    }

    try {
      const id = generateId();
      const duration = await getMediaDuration(file);

      // Upload to Supabase Storage
      const storagePath = await uploadToStorage(id, file);

      const now = new Date().toISOString();
      const videoData: Video = {
        id,
        filename: file.name,
        file_size: file.size,
        duration_seconds: duration,
        status: "uploaded",
        error_message: null,
        ranking: null,
        ranking_notes: null,
        storage_path: storagePath,
        created_at: now,
        updated_at: now,
      };

      await put(STORES.VIDEOS, videoData);
      successes.push(videoData);
    } catch (e) {
      errors.push({ filename: file.name, error: String(e) });
    }
    if (onProgress) onProgress(Math.round(((i + 1) / files.length) * 100));
  }
  return { successes, errors };
}

export async function getVideos(page = 1, perPage = 30): Promise<{ videos: Video[]; total: number }> {
  const allVideos = await getAll<Video>(STORES.VIDEOS);
  allVideos.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const total = allVideos.length;
  const start = (page - 1) * perPage;
  const videos = allVideos.slice(start, start + perPage);
  return { videos, total };
}

export async function getVideo(id: number): Promise<Video> {
  const video = await get<Video>(STORES.VIDEOS, id);
  if (!video) throw new Error("動画が見つかりません");
  return video;
}

export async function deleteVideo(id: number): Promise<void> {
  // Get video to find storage path
  const video = await get<Video>(STORES.VIDEOS, id);

  // Delete from Supabase Storage
  if (video?.storage_path) {
    try { await deleteFromStorage(video.storage_path); } catch { /* ignore */ }
  }

  // Delete from database (CASCADE deletes transcriptions and conversions)
  await del(STORES.VIDEOS, id);

  // Clear signed URL cache
  _signedUrlCache.delete(id);
}

export async function renameVideo(id: number, filename: string): Promise<Video> {
  await update(STORES.VIDEOS, id, { filename, updated_at: new Date().toISOString() });
  return getVideo(id);
}

export async function getVideoStreamUrl(id: number): Promise<string> {
  // Check cache
  const cached = _signedUrlCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const video = await get<Video>(STORES.VIDEOS, id);
  if (!video?.storage_path) return "";

  const url = await getVideoSignedUrl(video.storage_path);
  // Cache for 3.5 hours (signed URL valid for 4 hours)
  _signedUrlCache.set(id, { url, expiresAt: Date.now() + 3.5 * 60 * 60 * 1000 });
  return url;
}

export function getVideoThumbnailUrl(_id: number): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60' fill='%23cbd5e1'%3E%3Crect width='100' height='60' rx='4' fill='%23f1f5f9'/%3E%3Cpolygon points='40,15 40,45 65,30' fill='%23cbd5e1'/%3E%3C/svg%3E";
}

export async function updateVideoRanking(
  id: number,
  ranking: number | null,
  ranking_notes?: string,
): Promise<Video> {
  await update(STORES.VIDEOS, id, {
    ranking,
    ranking_notes: ranking_notes ?? null,
    updated_at: new Date().toISOString(),
  });
  return getVideo(id);
}

export async function getRankedVideos(): Promise<{ videos: Video[]; total: number }> {
  const allVideos = await getAll<Video>(STORES.VIDEOS);
  const videos = allVideos
    .filter((v) => v.ranking != null)
    .sort((a, b) => (a.ranking ?? 0) - (b.ranking ?? 0));
  return { videos, total: videos.length };
}
