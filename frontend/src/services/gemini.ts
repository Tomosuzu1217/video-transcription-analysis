import { GoogleGenerativeAI } from "@google/generative-ai";
import { get, STORES } from "./db";
import { decryptApiKeys } from "./crypto";
import type { SettingsRecord } from "../types";

type InlinePromptPart = { inlineData: { mimeType: string; data: string } };
type GeminiPrompt = string | Array<string | InlinePromptPart>;

interface TranscriptionSegmentResult {
  start_time: number;
  end_time: number;
  text: string;
}

interface TranscriptionResult {
  full_text: string;
  language: string;
  segments: TranscriptionSegmentResult[];
}

let _cachedKeys: string[] = [];
let _cachedModel: string = "gemini-2.5-flash";
let _keyIndex = 0;

async function loadSettings(): Promise<{ keys: string[]; model: string }> {
  const record = await get<SettingsRecord>(STORES.SETTINGS, "app");
  if (record) {
    _cachedKeys = await decryptApiKeys(record.api_keys ?? []);
    _cachedModel = record.selected_model ?? "gemini-2.5-flash";
  }
  return { keys: _cachedKeys, model: _cachedModel };
}

function nextKey(keys: string[]): string {
  if (keys.length === 0) throw new Error("APIキーが設定されていません。設定画面からAPIキーを追加してください。");
  const key = keys[_keyIndex % keys.length];
  _keyIndex++;
  return key;
}

export function isRateLimitError(e: unknown): boolean {
  const msg = String(e).toLowerCase();
  return msg.includes("429") || msg.includes("quota") || msg.includes("rate") || msg.includes("resource_exhausted");
}

function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    cleaned = lines.join("\n");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return { summary: cleaned } as T;
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      if (!base64) { reject(new Error("ファイルのBase64変換に失敗しました")); return; }
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function callGemini(
  prompt: GeminiPrompt,
): Promise<string> {
  const { keys, model } = await loadSettings();
  if (keys.length === 0) {
    throw new Error("APIキーが設定されていません。設定画面からAPIキーを追加してください。");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = nextKey(keys);
    try {
      const genAI = new GoogleGenerativeAI(key);
      const m = genAI.getGenerativeModel({ model });
      const result = await m.generateContent(prompt);
      return result.response.text();
    } catch (e) {
      lastError = e;
      if (isRateLimitError(e)) continue;
      throw e;
    }
  }
  throw new Error(`全てのAPIキーがレート制限に達しました: ${lastError}`);
}

export async function callGeminiJson<T = Record<string, unknown>>(
  prompt: GeminiPrompt,
): Promise<T> {
  const text = await callGemini(prompt);
  return parseJsonResponse<T>(text);
}

export async function transcribeMedia(
  file: File,
): Promise<TranscriptionResult> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "video/mp4";

  const prompt = [
    { inlineData: { mimeType, data: base64 } },
    `この動画・音声コンテンツを日本語で正確に書き起こしてください。

以下のJSON形式で返してください:
{
  "full_text": "書き起こし全文テキスト",
  "language": "ja",
  "segments": [
    {"start_time": 0.0, "end_time": 5.0, "text": "セグメントのテキスト"},
    {"start_time": 5.0, "end_time": 10.0, "text": "次のセグメントのテキスト"}
  ]
}

重要:
- 各セグメントは5〜15秒程度にしてください
- タイムスタンプは秒単位の小数で指定してください
- 必ず有効なJSONのみを返してください（説明文やマークダウンは不要）
- 日本語で書き起こしてください`,
  ];

  const result = await callGeminiJson<Partial<TranscriptionResult>>(prompt);
  return {
    full_text: result.full_text ?? "",
    language: result.language ?? "ja",
    segments: result.segments ?? [],
  };
}

export async function transcribeMediaWithKey(
  file: File,
  apiKey: string,
  model: string,
): Promise<TranscriptionResult> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type || "video/mp4";

  const prompt = [
    { inlineData: { mimeType, data: base64 } },
    `この動画・音声コンテンツを日本語で正確に書き起こしてください。

以下のJSON形式で返してください:
{
  "full_text": "書き起こし全文テキスト",
  "language": "ja",
  "segments": [
    {"start_time": 0.0, "end_time": 5.0, "text": "セグメントのテキスト"},
    {"start_time": 5.0, "end_time": 10.0, "text": "次のセグメントのテキスト"}
  ]
}

重要:
- 各セグメントは5〜15秒程度にしてください
- タイムスタンプは秒単位の小数で指定してください
- 必ず有効なJSONのみを返してください（説明文やマークダウンは不要）
- 日本語で書き起こしてください`,
  ];

  const genAI = new GoogleGenerativeAI(apiKey);
  const m = genAI.getGenerativeModel({ model });
  const result = await m.generateContent(prompt);
  const text = result.response.text();
  const parsed = parseJsonResponse<Partial<TranscriptionResult>>(text);

  return {
    full_text: parsed.full_text ?? "",
    language: parsed.language ?? "ja",
    segments: parsed.segments ?? [],
  };
}

export async function testApiKey(key: string, model: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const genAI = new GoogleGenerativeAI(key);
    const m = genAI.getGenerativeModel({ model });
    await m.generateContent("テスト。1+1=?");
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}
