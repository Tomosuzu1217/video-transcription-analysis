import { useState, useEffect, useCallback, useRef } from "react";
import {
  getApiKeys,
  addApiKey,
  removeApiKey,
  getModelSetting,
  setModelSetting,
  testSingleApiKey,
} from "../api/settings";
import { getStorageUsage, type StorageUsage } from "../api/storage";
import Toast, { useToast } from "../components/Toast";
import StorageUsageBar from "../components/StorageUsageBar";
import type { ApiKeysResponse, ModelResponse, TestResult } from "../api/settings";

export default function SettingsPage() {
  const [keysData, setKeysData] = useState<ApiKeysResponse | null>(null);
  const [modelData, setModelData] = useState<ModelResponse | null>(null);
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testProgress, setTestProgress] = useState<{ current: number; total: number } | null>(null);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const { toast, showToast, clearToast } = useToast();
  const customModelRef = useRef<HTMLInputElement>(null);

  const fetchStorage = useCallback(async () => {
    try {
      const data = await getStorageUsage();
      setStorageUsage(data);
    } catch {
      /* silent */
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const data = await getApiKeys();
      setKeysData(data);
    } catch {
      showToast("APIキー情報の取得に失敗しました", "error");
    }
  }, []);

  const fetchModel = useCallback(async () => {
    try {
      const data = await getModelSetting();
      setModelData(data);
    } catch {
      showToast("モデル設定の取得に失敗しました", "error");
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    fetchModel();
    fetchStorage();
  }, [fetchKeys, fetchModel, fetchStorage]);

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    try {
      const res = await addApiKey(newKey.trim());
      if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast(res.message ?? "追加しました", "success");
        setNewKey("");
        setTestResults(null);
        await fetchKeys();
      }
    } catch {
      showToast("APIキーの追加に失敗しました", "error");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveKey = async (index: number) => {
    if (!window.confirm("このAPIキーを削除しますか?")) return;
    try {
      const res = await removeApiKey(index);
      if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast(res.message ?? "削除しました", "success");
        setTestResults(null);
        await fetchKeys();
      }
    } catch {
      showToast("APIキーの削除に失敗しました", "error");
    }
  };

  const handleTest = async () => {
    if (!keysData || keysData.keys.length === 0) return;
    setTesting(true);
    setTestResults(null);
    const total = keysData.keys.length;
    setTestProgress({ current: 0, total });
    const results: TestResult[] = [];
    try {
      for (let i = 0; i < total; i++) {
        setTestProgress({ current: i + 1, total });
        try {
          const result = await testSingleApiKey(i);
          results.push(result);
        } catch {
          results.push({ index: i, valid: false, error: "通信エラー" });
        }
        setTestResults([...results]);
      }
      const valid = results.filter((r) => r.valid).length;
      showToast(`${valid}/${total} 件のキーが有効です`, valid > 0 ? "success" : "error");
    } catch {
      showToast("テストに失敗しました", "error");
    } finally {
      setTesting(false);
      setTestProgress(null);
    }
  };

  const handleModelChange = async (model: string) => {
    try {
      await setModelSetting(model);
      setModelData((prev) => (prev ? { ...prev, current: model } : prev));
      showToast("モデルを変更しました", "success");
    } catch {
      showToast("モデルの変更に失敗しました", "error");
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-900">設定</h2>

      {/* Gemini API Keys Section */}
      <section className="rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Gemini APIキー</h3>
          <p className="mt-1 text-sm text-gray-500">
            Google AI Studioの無料APIキーを複数登録できます。レート制限時に自動で次のキーに切り替わります。
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Add new key */}
          <div className="flex gap-2">
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddKey()}
              placeholder="AIzaSy... (Google AI Studio APIキー)"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <button
              onClick={handleAddKey}
              disabled={adding || !newKey.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {adding ? "追加中..." : "追加"}
            </button>
          </div>

          {/* Key list */}
          {keysData && keysData.keys.length > 0 ? (
            <div className="space-y-2">
              {keysData.keys.map((maskedKey, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                      {i + 1}
                    </span>
                    <code className="text-sm text-gray-700 font-mono">{maskedKey}</code>
                    {testResults && testResults[i] && (
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          testResults[i].valid
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {testResults[i].valid ? "有効" : "無効"}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveKey(i)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    title="削除"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-2">
              APIキーが登録されていません。AI分析機能を使用するにはキーを追加してください。
            </p>
          )}

          {/* Test button with progress */}
          {keysData && keysData.keys.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={handleTest}
                disabled={testing}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {testing ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-r-transparent" />
                    テスト中...{testProgress ? ` (${testProgress.current}/${testProgress.total})` : ""}
                  </span>
                ) : (
                  "全キーをテスト"
                )}
              </button>
              {testing && testProgress && (
                <div className="h-1.5 w-full max-w-xs rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.round((testProgress.current / testProgress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Model Selection Section */}
      <section className="rounded-xl bg-white border border-gray-100 shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Geminiモデル</h3>
          <p className="mt-1 text-sm text-gray-500">
            AI分析に使用するモデルを選択します。無料枠ではFlashモデルを推奨します。
          </p>
        </div>

        <div className="px-6 py-4">
          {modelData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {modelData.available.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-all ${
                    modelData.current === m.id
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div>
                    <p className={`text-sm font-medium ${modelData.current === m.id ? "text-blue-700" : "text-gray-900"}`}>
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 font-mono">{m.id}</p>
                  </div>
                  {modelData.current === m.id && (
                    <svg className="h-5 w-5 text-blue-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-r-transparent" />
              読み込み中...
            </div>
          )}

          {/* Custom model input */}
          <div className="mt-4">
            <p className="text-xs text-gray-500 mb-2">リストにないモデルを使用する場合:</p>
            <div className="flex gap-2">
              <input
                ref={customModelRef}
                type="text"
                placeholder="gemini-3.0-flash など"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.currentTarget;
                    if (input.value.trim()) {
                      handleModelChange(input.value.trim());
                      input.value = "";
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = customModelRef.current;
                  if (input?.value.trim()) {
                    handleModelChange(input.value.trim());
                    input.value = "";
                  }
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                適用
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Storage Usage Section */}
      {storageUsage && (
        <section className="rounded-xl bg-white border border-gray-100 shadow-sm px-6 py-4">
          <StorageUsageBar usedBytes={storageUsage.usedBytes} limitBytes={storageUsage.limitBytes} />
        </section>
      )}

      {/* Info Section */}
      <section className="rounded-xl bg-gray-50 border border-gray-200 px-6 py-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">APIキーの取得方法</h4>
        <ol className="space-y-1 text-sm text-gray-600 list-decimal list-inside">
          <li>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google AI Studio
            </a>
            にアクセスしてGoogleアカウントでログイン
          </li>
          <li>「APIキーを作成」をクリックしてキーを生成</li>
          <li>生成されたキーをコピーして上の入力欄に貼り付け</li>
          <li>複数のGoogleアカウントで別々のキーを作成すると、レート制限を分散できます</li>
        </ol>
      </section>

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}
