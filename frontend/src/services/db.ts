import { supabase } from "./supabase";

export const STORES = {
  VIDEOS: "videos",
  TRANSCRIPTIONS: "transcriptions",
  SETTINGS: "settings",
  ANALYSES: "analyses",
  TRANSCRIPTION_LOGS: "transcription_logs",
  CONVERSIONS: "conversions",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

const PRIMARY_KEYS: Record<StoreName, string> = {
  videos: "id",
  transcriptions: "id",
  settings: "key",
  analyses: "id",
  transcription_logs: "id",
  conversions: "id",
};

/** Crypto-random numeric ID within safe integer range */
export function generateId(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return Date.now() * 1000 + (arr[0] % 1000);
}

export async function put<T>(storeName: StoreName, record: T): Promise<void> {
  const { error } = await supabase.from(storeName).upsert(record as any);
  if (error) throw error;
}

export async function get<T>(storeName: StoreName, key: string | number): Promise<T | undefined> {
  const pk = PRIMARY_KEYS[storeName];
  const { data, error } = await supabase
    .from(storeName)
    .select("*")
    .eq(pk, key)
    .maybeSingle();
  if (error) throw error;
  return (data as T) ?? undefined;
}

export async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const results: T[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(storeName)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return results;
}

export async function getAllByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: string | number,
): Promise<T[]> {
  const results: T[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(storeName)
      .select("*")
      .eq(indexName, value)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    results.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return results;
}

export async function del(storeName: StoreName, key: string | number): Promise<void> {
  const pk = PRIMARY_KEYS[storeName];
  const { error } = await supabase.from(storeName).delete().eq(pk, key);
  if (error) throw error;
}

export async function update<T>(
  storeName: StoreName,
  key: string | number,
  changes: Partial<T>,
): Promise<T> {
  const pk = PRIMARY_KEYS[storeName];
  const { data, error } = await supabase
    .from(storeName)
    .update(changes as any)
    .eq(pk, key)
    .select()
    .single();
  if (error) throw error;
  return data as T;
}

export async function count(storeName: StoreName): Promise<number> {
  const { count: c, error } = await supabase
    .from(storeName)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return c ?? 0;
}
