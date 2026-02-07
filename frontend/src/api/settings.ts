import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { testApiKey as testGeminiKey } from "../services/gemini";

const SETTINGS_DOC = doc(db, "settings", "app");

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

export interface TestResponse {
  results: TestResult[];
  model: string;
  message?: string;
}

async function getSettingsData(): Promise<{ apiKeys: string[]; selectedModel: string }> {
  const snap = await getDoc(SETTINGS_DOC);
  if (snap.exists()) {
    const data = snap.data();
    return {
      apiKeys: data.apiKeys ?? [],
      selectedModel: data.selectedModel ?? "gemini-2.5-flash",
    };
  }
  return { apiKeys: [], selectedModel: "gemini-2.5-flash" };
}

async function saveSettings(data: Partial<{ apiKeys: string[]; selectedModel: string }>) {
  const current = await getSettingsData();
  await setDoc(SETTINGS_DOC, { ...current, ...data });
}

export async function getApiKeys(): Promise<ApiKeysResponse> {
  const { apiKeys } = await getSettingsData();
  // Mask keys for display (show first 8 + last 4 chars)
  const masked = apiKeys.map((k) =>
    k.length > 12 ? k.slice(0, 8) + "..." + k.slice(-4) : k,
  );
  return { keys: masked, count: apiKeys.length };
}

export async function addApiKey(key: string): Promise<{ message?: string; error?: string; count: number }> {
  const { apiKeys } = await getSettingsData();
  if (apiKeys.includes(key)) {
    return { error: "このAPIキーは既に追加されています", count: apiKeys.length };
  }
  apiKeys.push(key);
  await saveSettings({ apiKeys });
  return { message: "APIキーを追加しました", count: apiKeys.length };
}

export async function removeApiKey(index: number): Promise<{ message?: string; error?: string; count: number }> {
  const { apiKeys } = await getSettingsData();
  if (index < 0 || index >= apiKeys.length) {
    return { error: "無効なインデックスです", count: apiKeys.length };
  }
  apiKeys.splice(index, 1);
  await saveSettings({ apiKeys });
  return { message: "APIキーを削除しました", count: apiKeys.length };
}

export async function getModelSetting(): Promise<ModelResponse> {
  const { selectedModel } = await getSettingsData();
  return {
    current: selectedModel,
    available: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    ],
  };
}

export async function setModelSetting(model: string): Promise<{ message: string; current: string }> {
  await saveSettings({ selectedModel: model });
  return { message: "モデルを更新しました", current: model };
}

export async function testApiKeys(): Promise<TestResponse> {
  const { apiKeys, selectedModel } = await getSettingsData();
  const results: TestResult[] = [];
  for (let i = 0; i < apiKeys.length; i++) {
    const r = await testGeminiKey(apiKeys[i], selectedModel);
    results.push({ index: i, valid: r.valid, error: r.error });
  }
  return { results, model: selectedModel, message: `${results.filter((r) => r.valid).length}/${results.length} 個のキーが有効です` };
}

export async function testSingleApiKey(index: number): Promise<TestResult> {
  const { apiKeys, selectedModel } = await getSettingsData();
  if (index < 0 || index >= apiKeys.length) {
    return { index, valid: false, error: "無効なインデックスです" };
  }
  const r = await testGeminiKey(apiKeys[index], selectedModel);
  return { index, valid: r.valid, error: r.error };
}
