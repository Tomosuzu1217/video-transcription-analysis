import { supabase } from "./supabase";

const BUCKET = "videos";

/** Remove path traversal sequences and dangerous characters from filename */
function sanitizeFileName(name: string): string {
  return name
    .replace(/\.\.[/\\]/g, "")    // remove ../ or ..\
    .replace(/[/\\]/g, "_")       // replace path separators
    .replace(/[\x00-\x1f]/g, "")  // remove control characters
    .replace(/^\.+/, "")          // remove leading dots
    .slice(0, 255)                // limit length
    || "unnamed";
}

export async function saveVideo(id: number, file: File): Promise<string> {
  const safeName = sanitizeFileName(file.name);
  const path = `${id}/${safeName}`;
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
