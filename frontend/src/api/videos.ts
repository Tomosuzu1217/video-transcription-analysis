import { get, getAll, put, del, update, generateId, STORES } from "../services/db";
import { saveVideo as uploadToStorage, getVideoSignedUrl, deleteVideo as deleteFromStorage, uploadThumbnail, deleteThumbnails } from "../services/videoStorage";
import { extractThumbnails } from "../utils/thumbnailExtractor";
import type { Video, VideoThumbnail } from "../types";

export interface UploadResult {
  successes: Video[];
  errors: { filename: string; error: string }[];
}

/** Supabase Storage free tier: 50MB per file */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** Allowed MIME type prefixes for upload */
const ALLOWED_MIME_PREFIXES = ["video/", "audio/"];
const ALLOWED_EXTENSIONS = new Set([
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".flv", ".wmv", ".m4v",
  ".mp3", ".wav", ".aac", ".ogg", ".flac", ".wma", ".m4a", ".opus",
]);

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
  codes?: string[],
): Promise<UploadResult> {
  const successes: Video[] = [];
  const errors: { filename: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // File type validation
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const mimeOk = ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p));
    const extOk = ALLOWED_EXTENSIONS.has(ext);
    if (!mimeOk && !extOk) {
      errors.push({
        filename: file.name,
        error: `対応していないファイル形式です: ${file.type || ext}`,
      });
      if (onProgress) onProgress(Math.round(((i + 1) / files.length) * 100));
      continue;
    }

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
        code: codes?.[i]?.trim() || null,
        storage_path: storagePath,
        tags: [],
        thumbnails: [],
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

  // Delete video file from Supabase Storage
  if (video?.storage_path) {
    try { await deleteFromStorage(video.storage_path); } catch { /* ignore */ }
  }

  // Delete thumbnails from Supabase Storage
  if (video?.thumbnails?.length) {
    try { await deleteThumbnails(video.thumbnails.map((t) => t.storage_path)); } catch { /* ignore */ }
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

export function getVideoThumbnailUrl(id: number): string {
  void id;
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

export async function updateVideoTags(id: number, tags: string[]): Promise<Video> {
  await update(STORES.VIDEOS, id, { tags, updated_at: new Date().toISOString() });
  return getVideo(id);
}

export async function updateVideoCode(id: number, code: string | null): Promise<Video> {
  await update(STORES.VIDEOS, id, {
    code: code?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  return getVideo(id);
}

export async function archiveVideo(
  id: number,
  onProgress?: (stage: string) => void,
): Promise<Video> {
  const video = await getVideo(id);
  if (!video.storage_path) throw new Error("動画ファイルが見つかりません");
  if (!video.duration_seconds) throw new Error("動画の長さが不明です");

  // 1. Get signed URL for video
  onProgress?.("サムネイル抽出中...");
  const videoUrl = await getVideoSignedUrl(video.storage_path);

  // 2. Extract thumbnails
  const frames = await extractThumbnails(videoUrl, video.duration_seconds);

  // 3. Upload thumbnails
  onProgress?.("サムネイルをアップロード中...");
  const thumbs: VideoThumbnail[] = [];
  for (const frame of frames) {
    const path = await uploadThumbnail(id, frame.time, frame.blob);
    thumbs.push({ time: frame.time, storage_path: path });
  }

  // 4. Update video record
  onProgress?.("動画ファイルを削除中...");
  await update(STORES.VIDEOS, id, {
    thumbnails: thumbs,
    status: "archived",
    updated_at: new Date().toISOString(),
  });

  // 5. Delete original video file
  await deleteFromStorage(video.storage_path);

  // Clear signed URL cache
  _signedUrlCache.delete(id);

  return getVideo(id);
}
