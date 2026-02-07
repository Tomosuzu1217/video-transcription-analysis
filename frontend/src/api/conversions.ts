import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where,
} from "firebase/firestore";
import type { Conversion, ConversionSummary } from "../types";

function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function convFromDoc(d: any): Conversion {
  return {
    id: d.id,
    video_id: d.video_id,
    metric_name: d.metric_name,
    metric_value: d.metric_value,
    date_recorded: d.date_recorded ?? null,
    notes: d.notes ?? null,
    created_at: d.created_at ?? "",
    updated_at: d.updated_at ?? "",
  };
}

export async function createConversion(data: {
  video_id: number;
  metric_name: string;
  metric_value: number;
  date_recorded?: string;
  notes?: string;
}): Promise<Conversion> {
  const id = generateId();
  const now = new Date().toISOString();
  const convData = {
    id,
    video_id: data.video_id,
    metric_name: data.metric_name,
    metric_value: data.metric_value,
    date_recorded: data.date_recorded ?? null,
    notes: data.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await setDoc(doc(db, "conversions", String(id)), convData);
  return convFromDoc(convData);
}

export async function getConversions(videoId?: number): Promise<Conversion[]> {
  let q;
  if (videoId) {
    q = query(collection(db, "conversions"), where("video_id", "==", videoId));
  } else {
    q = query(collection(db, "conversions"));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => convFromDoc(d.data()));
}

export async function updateConversion(
  id: number,
  data: Partial<{ metric_name: string; metric_value: number; date_recorded: string; notes: string }>,
): Promise<Conversion> {
  const docRef = doc(db, "conversions", String(id));
  await updateDoc(docRef, { ...data, updated_at: new Date().toISOString() });
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("コンバージョンが見つかりません");
  return convFromDoc(snap.data());
}

export async function deleteConversion(id: number): Promise<void> {
  await deleteDoc(doc(db, "conversions", String(id)));
}

export async function getConversionSummary(): Promise<ConversionSummary[]> {
  const convSnap = await getDocs(collection(db, "conversions"));
  const byVideo = new Map<number, { metrics: Record<string, number>; filename: string }>();

  for (const d of convSnap.docs) {
    const data = d.data();
    const vid = data.video_id;
    if (!byVideo.has(vid)) byVideo.set(vid, { metrics: {}, filename: "" });
    const entry = byVideo.get(vid)!;
    entry.metrics[data.metric_name] = data.metric_value;
  }

  // Get filenames
  for (const [vid, entry] of byVideo) {
    const vSnap = await getDoc(doc(db, "videos", String(vid)));
    entry.filename = vSnap.exists() ? vSnap.data().filename : "unknown";
  }

  return Array.from(byVideo.entries()).map(([vid, entry]) => ({
    video_id: vid,
    video_filename: entry.filename,
    metrics: entry.metrics,
  }));
}
