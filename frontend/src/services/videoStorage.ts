import { supabase } from "./supabase";

const BUCKET = "videos";

/** Extract file extension (ASCII-safe, lowercase) */
function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "mp4";
  const ext = filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "mp4";
}

export async function saveVideo(id: number, file: File): Promise<string> {
  // Use ASCII-safe path: {id}/media.{ext}
  // Japanese/non-ASCII filenames cause issues with S3-compatible storage
  const ext = getExtension(file.name);
  const path = `${id}/media.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "video/mp4",
    });
  if (error) throw error;
  return path;
}

export async function getVideoSignedUrl(storagePath: string, expiresIn = 14400): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function downloadVideoAsBlob(storagePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);
  if (error) throw error;
  return data;
}

export async function deleteVideo(storagePath: string): Promise<void> {
  if (!storagePath) return;
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([storagePath]);
  if (error) throw error;
}

export async function uploadThumbnail(
  videoId: number,
  timeSec: number,
  blob: Blob,
): Promise<string> {
  const path = `${videoId}/thumb_${timeSec}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      cacheControl: "86400",
      upsert: true,
      contentType: "image/jpeg",
    });
  if (error) throw error;
  return path;
}

export async function deleteThumbnails(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove(paths);
  if (error) throw error;
}
