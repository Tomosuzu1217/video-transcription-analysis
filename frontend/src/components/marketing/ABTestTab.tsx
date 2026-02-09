import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { createABTest, getABTests, deleteABTest, updateABTest, getABTestResult } from "../../api/abTests";
import type { ABTest, ABTestResult, Video, ConversionSummary } from "../../types";

interface Props {
  videos: Video[];
  convSummaries: ConversionSummary[];
  allMetrics: string[];
  showToast: (msg: string, type: "success" | "error") => void;
}

export default function ABTestTab({ videos, convSummaries, allMetrics, showToast }: Props) {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<ABTestResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  // Form
  const [name, setName] = useState("");
  const [videoAId, setVideoAId] = useState<number | "">("");
  const [videoBId, setVideoBId] = useState<number | "">("");
  const [metric, setMetric] = useState("");

  const fetchTests = useCallback(async () => {
    try {
      setTests(await getABTests());
    } catch { showToast("A/Bテストの取得に失敗しました", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  const handleCreate = async () => {
    if (!name.trim() || videoAId === "" || videoBId === "" || !metric) {
      showToast("全項目を入力してください", "error"); return;
    }
    if (videoAId === videoBId) { showToast("異なる動画を選択してください", "error"); return; }
    try {
      await createABTest({ name: name.trim(), video_a_id: Number(videoAId), video_b_id: Number(videoBId), target_metric: metric });
      setName(""); setVideoAId(""); setVideoBId(""); setMetric("");
      await fetchTests();
      showToast("A/Bテストを作成しました", "success");
    } catch { showToast("作成に失敗しました", "error"); }
  };

  const handleViewResult = async (test: ABTest) => {
    try {
      setLoadingResult(true);
      setSelectedResult(await getABTestResult(test));
    } catch { showToast("結果の取得に失敗しました", "error"); }
    finally { setLoadingResult(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("このテストを削除しますか？")) return;
    try {
      await deleteABTest(id);
      if (selectedResult?.test.id === id) setSelectedResult(null);
      await fetchTests();
      showToast("削除しました", "success");
    } catch { showToast("削除に失敗しました", "error"); }
  };

  const handleStatusChange = async (id: number, status: ABTest["status"]) => {
    try {
      await updateABTest(id, { status });
      await fetchTests();
    } catch { showToast("更新に失敗しました", "error"); }
  };

  const videosWithConv = videos.filter((v) => convSummaries.some((s) => s.video_id === v.id));

  const barData = selectedResult && selectedResult.value_a !== null && selectedResult.value_b !== null
    ? [
        { name: "A: " + selectedResult.video_a_name.slice(0, 15), value: selectedResult.value_a },
        { name: "B: " + selectedResult.video_b_name.slice(0, 15), value: selectedResult.value_b },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">新規A/Bテスト</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="テスト名"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
          <select value={videoAId} onChange={(e) => setVideoAId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">動画A</option>
            {videosWithConv.map((v) => <option key={v.id} value={v.id}>{v.filename}</option>)}
          </select>
          <select value={videoBId} onChange={(e) => setVideoBId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">動画B</option>
            {videosWithConv.map((v) => <option key={v.id} value={v.id}>{v.filename}</option>)}
          </select>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">対象指標</option>
            {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <button onClick={handleCreate} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
          テスト作成
        </button>
      </div>

      {/* Test list */}
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
      ) : tests.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">A/Bテストがありません。</p>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => (
            <div key={t.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-white">{t.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">指標: {t.target_metric}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <select value={t.status} onChange={(e) => handleStatusChange(t.id, e.target.value as ABTest["status"])}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                    t.status === "completed" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700"
                    : t.status === "running" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                  }`}>
                  <option value="draft">下書き</option>
                  <option value="running">実施中</option>
                  <option value="completed">完了</option>
                </select>
                <button onClick={() => handleViewResult(t)} className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  結果
                </button>
                <button onClick={() => handleDelete(t.id)} className="rounded-md border border-red-300 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Result display */}
      {loadingResult && (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        </div>
      )}
      {selectedResult && !loadingResult && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">テスト結果: {selectedResult.test.name}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
              <p className="text-xs text-blue-600 dark:text-blue-400">A: {selectedResult.video_a_name.slice(0, 15)}</p>
              <p className="text-xl font-bold text-blue-900 dark:text-blue-200">{selectedResult.value_a ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
              <p className="text-xs text-purple-600 dark:text-purple-400">B: {selectedResult.video_b_name.slice(0, 15)}</p>
              <p className="text-xl font-bold text-purple-900 dark:text-purple-200">{selectedResult.value_b ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3 text-center">
              <p className="text-xs text-green-600 dark:text-green-400">リフト</p>
              <p className={`text-xl font-bold ${(selectedResult.lift_percent ?? 0) >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                {selectedResult.lift_percent !== null ? `${selectedResult.lift_percent > 0 ? "+" : ""}${selectedResult.lift_percent}%` : "-"}
              </p>
            </div>
            <div className="rounded-lg p-3 text-center" style={{ background: selectedResult.significant ? "#dcfce7" : "#fef3c7" }}>
              <p className="text-xs" style={{ color: selectedResult.significant ? "#15803d" : "#a16207" }}>有意差</p>
              <p className="text-xl font-bold" style={{ color: selectedResult.significant ? "#15803d" : "#a16207" }}>
                {selectedResult.significant ? "あり" : "なし"}
              </p>
              {selectedResult.z_score !== null && (
                <p className="text-xs text-gray-500">z={selectedResult.z_score}</p>
              )}
            </div>
          </div>
          {barData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} layout="vertical" margin={{ left: 100, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
