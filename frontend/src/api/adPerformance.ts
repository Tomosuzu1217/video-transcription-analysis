import { supabase } from "../services/supabase";
import { getAll, del, STORES } from "../services/db";
import type { AdPerformance, AdPerformanceImportRow, VideoRecord } from "../types";

export async function getAllAdPerformance(): Promise<AdPerformance[]> {
  return getAll<AdPerformance>(STORES.AD_PERFORMANCE);
}

export async function getAdPerformanceByCode(
  code: string,
): Promise<AdPerformance | undefined> {
  const { data, error } = await supabase
    .from(STORES.AD_PERFORMANCE)
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as AdPerformance) ?? undefined;
}

export async function getAdPerformanceForVideos(
  videos: VideoRecord[],
): Promise<Map<string, AdPerformance>> {
  const codes = videos.map((v) => v.code).filter((c): c is string => !!c);
  if (codes.length === 0) return new Map();

  const { data, error } = await supabase
    .from(STORES.AD_PERFORMANCE)
    .select("*")
    .in("code", codes);
  if (error) throw error;

  const map = new Map<string, AdPerformance>();
  for (const row of (data as AdPerformance[]) ?? []) {
    map.set(row.code, row);
  }
  return map;
}

export async function importAdPerformance(
  rows: AdPerformanceImportRow[],
): Promise<{ inserted: number; errors: string[] }> {
  const now = new Date().toISOString();
  const base = Date.now() * 1000;
  const records = rows.map((r, i) => ({
    id: base + i,
    ...r,
    imported_at: now,
  }));

  const CHUNK = 500;
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { error, count } = await supabase
      .from(STORES.AD_PERFORMANCE)
      .upsert(chunk, { onConflict: "code", count: "exact" });
    if (error) {
      errors.push(error.message);
    } else {
      inserted += count ?? chunk.length;
    }
  }

  return { inserted, errors };
}

export async function deleteAdPerformance(id: number): Promise<void> {
  await del(STORES.AD_PERFORMANCE, id);
}

export async function deleteAllAdPerformance(): Promise<void> {
  const { error } = await supabase
    .from(STORES.AD_PERFORMANCE)
    .delete()
    .neq("id", 0);
  if (error) throw error;
}
