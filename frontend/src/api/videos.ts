import { db, storage } from "../firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, where, getCountFromServer,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import type { Video } from "../types";

export interface UploadResult {
  successes: Video[];
  errors: { filename: string; error: string }[];
}

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

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

// URL cache for sync getVideoStreamUrl / getVideoThumbnailUrl
const _urlCache = new Map<number, string>();

function cacheUrl(id: number, url: string) { _urlCache.set(id, url); }

function videoFromDoc(docSnap: any): Video {
  const d = docSnap.data();
  const v: Video = {
    id: d.id,
    filename: d.filename,
    file_size: d.file_size ?? null,
    duration_seconds: d.duration_seconds ?? null,
    status: d.status ?? "uploaded",
    error_message: d.error_message ?? null,
    ranking: d.ranking ?? null,
    ranking_notes: d.ranking_notes ?? null,
    storage_url: d.storage_url ?? "",
    created_at: d.created_at ?? "",
    updated_at: d.updated_at ?? "",
  };
  if (v.storage_url) cacheUrl(v.id, v.storage_url);
  return v;
}

export async function uploadVideos(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const successes: Video[] = [];
  const errors: { filename: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const id = generateId();
      const storagePath = `videos/${id}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);
      const duration = await getMediaDuration(file);
      const now = new Date().toISOString();

      const videoData = {
        id,
        filename: file.name,
        file_size: file.size,
        duration_seconds: duration,
        status: "uploaded",
        error_message: null,
        ranking: null,
        ranking_notes: null,
        storage_url: downloadUrl,
        storage_path: storagePath,
        created_at: now,
        updated_at: now,
      };

      await setDoc(doc(db, "videos", String(id)), videoData);
      cacheUrl(id, downloadUrl);
      successes.push(videoFromDoc({ data: () => videoData }));
    } catch (e) {
      errors.push({ filename: file.name, error: String(e) });
    }
    if (onProgress) onProgress(Math.round(((i + 1) / files.length) * 100));
  }
  return { successes, errors };
}

export async function getVideos(page = 1, perPage = 30): Promise<{ videos: Video[]; total: number }> {
  const col = collection(db, "videos");
  const countSnap = await getCountFromServer(col);
  const total = countSnap.data().count;

  const q = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  const allVideos = snap.docs.map(videoFromDoc);

  const start = (page - 1) * perPage;
  const videos = allVideos.slice(start, start + perPage);
  return { videos, total };
}

export async function getVideo(id: number): Promise<Video> {
  const snap = await getDoc(doc(db, "videos", String(id)));
  if (!snap.exists()) throw new Error("動画が見つかりません");
  return videoFromDoc(snap);
}

export async function deleteVideo(id: number): Promise<void> {
  const snap = await getDoc(doc(db, "videos", String(id)));
  if (snap.exists()) {
    const data = snap.data();
    if (data.storage_path) {
      try { await deleteObject(ref(storage, data.storage_path)); } catch { /* ignore */ }
    }
  }
  await deleteDoc(doc(db, "videos", String(id)));
  // Also delete related transcription
  const tSnap = await getDocs(query(collection(db, "transcriptions"), where("videoId", "==", id)));
  for (const d of tSnap.docs) await deleteDoc(d.ref);
  // Delete related conversions
  const cSnap = await getDocs(query(collection(db, "conversions"), where("video_id", "==", id)));
  for (const d of cSnap.docs) await deleteDoc(d.ref);
  _urlCache.delete(id);
}

export async function renameVideo(id: number, filename: string): Promise<Video> {
  const docRef = doc(db, "videos", String(id));
  await updateDoc(docRef, { filename, updated_at: new Date().toISOString() });
  return getVideo(id);
}

export function getVideoStreamUrl(id: number): string {
  return _urlCache.get(id) || "";
}

export function getVideoThumbnailUrl(id: number): string {
  // Return the video URL — browsers will show first frame in <video> poster
  // For <img> tags, return a placeholder
  return _urlCache.get(id) || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 60' fill='%23cbd5e1'%3E%3Crect width='100' height='60' rx='4' fill='%23f1f5f9'/%3E%3Cpolygon points='40,15 40,45 65,30' fill='%23cbd5e1'/%3E%3C/svg%3E";
}

export async function updateVideoRanking(
  id: number,
  ranking: number | null,
  ranking_notes?: string,
): Promise<Video> {
  const docRef = doc(db, "videos", String(id));
  await updateDoc(docRef, {
    ranking,
    ranking_notes: ranking_notes ?? null,
    updated_at: new Date().toISOString(),
  });
  return getVideo(id);
}

export async function getRankedVideos(): Promise<{ videos: Video[]; total: number }> {
  const q = query(collection(db, "videos"), where("ranking", "!=", null), orderBy("ranking", "asc"));
  const snap = await getDocs(q);
  const videos = snap.docs.map(videoFromDoc);
  return { videos, total: videos.length };
}
