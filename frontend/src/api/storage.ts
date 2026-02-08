import { supabase } from "../services/supabase";

export interface StorageUsage {
  usedBytes: number;
  limitBytes: number;
  percent: number;
}

const STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB

export async function getStorageUsage(): Promise<StorageUsage> {
  const { data, error } = await supabase
    .from("videos")
    .select("file_size");
  if (error) throw error;

  const usedBytes = (data ?? []).reduce(
    (sum, row) => sum + (row.file_size ?? 0),
    0
  );

  return {
    usedBytes,
    limitBytes: STORAGE_LIMIT_BYTES,
    percent: (usedBytes / STORAGE_LIMIT_BYTES) * 100,
  };
}
