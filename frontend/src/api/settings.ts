import { get, STORES } from "../services/db";
import { supabase } from "../services/supabase";
import { testApiKey as testGeminiKey } from "../services/gemini";
import { encryptApiKeys, decryptApiKeys } from "../services/crypto";
import type { SettingsRecord } from "../types";

export interface ApiKeysResponse {
  keys: string[];
  count: number;
}

export interface ModelResponse {
  current: string;
  available: { id: string; label: string }[];
}

export interface TestResult {
  index: number;
  valid: boolean;
  error?: string;
}

async function getSettingsData(): Promise<{ apiKeys: string[]; selectedModel: string }> {
  const record = await get<SettingsRecord>(STORES.SETTINGS, "app");
  const rawKeys = record?.api_keys ?? [];
  // Decrypt API keys (handles both encrypted and legacy plain-text keys)
  const apiKeys = await decryptApiKeys(rawKeys);
  return {
    apiKeys,
    selectedModel: record?.selected_model ?? "gemini-2.5-flash",
  };
}

/** Atomically update only the api_keys column (encrypted at rest) */
async function saveApiKeys(apiKeys: string[]): Promise<void> {
  const encrypted = await encryptApiKeys(apiKeys);
  const { error } = await supabase
    .from("settings")
    .update({ api_keys: encrypted })
    .eq("key", "app");
  if (error) throw error;
}

/** Atomically update only the selected_model column */
async function saveModel(model: string): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .update({ selected_model: model })
    .eq("key", "app");
  if (error) throw error;
}

export async function getApiKeys(): Promise<ApiKeysResponse> {
  const { apiKeys } = await getSettingsData();
  const masked = apiKeys.map((k) =>
    k.length > 12 ? k.slice(0, 8) + "..." + k.slice(-4) : k,
  );
  return { keys: masked, count: apiKeys.length };
}

export async function addApiKey(key: string): Promise<{ message?: string; error?: string; count: number }> {
  // Re-read right before write to minimize race window
  const { apiKeys } = await getSettingsData();
  if (apiKeys.includes(key)) {
    return { error: "このAPIキーは既に追加されています", count: apiKeys.length };
  }
  const updated = [...apiKeys, key];
  await saveApiKeys(updated);
  return { message: "APIキーを追加しました", count: updated.length };
}

export async function removeApiKey(index: number): Promise<{ message?: string; error?: string; count: number }> {
  // Re-read right before write to minimize race window
  const { apiKeys } = await getSettingsData();
  if (index < 0 || index >= apiKeys.length) {
    return { error: "無効なインデックスです", count: apiKeys.length };
  }
  const updated = apiKeys.filter((_, i) => i !== index);
  await saveApiKeys(updated);
  return { message: "APIキーを削除しました", count: updated.length };
}

export async function getModelSetting(): Promise<ModelResponse> {
  const { selectedModel } = await getSettingsData();
  return {
    current: selectedModel,
    available: [
      { id: "gemini-3-flash-preview", label: "Gemini 3.0 Flash (Preview)" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  };
}

export async function setModelSetting(model: string): Promise<{ message: string; current: string }> {
  await saveModel(model);
  return { message: "モデルを更新しました", current: model };
}

export async function testSingleApiKey(index: number): Promise<TestResult> {
  const { apiKeys, selectedModel } = await getSettingsData();
  if (index < 0 || index >= apiKeys.length) {
    return { index, valid: false, error: "無効なインデックスです" };
  }
  const r = await testGeminiKey(apiKeys[index], selectedModel);
  return { index, valid: r.valid, error: r.error };
}
