import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { createABTest, getABTests, deleteABTest, updateABTest, getABTestResult } from "../../api/abTests";
import { runABDeepComparison } from "../../api/analysis";
import { getErrorMessage } from "../../utils/errors";
import type { ABTest, ABTestResult, ABDeepComparisonResult, Video, ConversionSummary } from "../../types";

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

  // AI Deep Comparison
  const [deepCompareIdA, setDeepCompareIdA] = useState<number | "">("");
  const [deepCompareIdB, setDeepCompareIdB] = useState<number | "">("");
  const [deepCompareResult, setDeepCompareResult] = useState<ABDeepComparisonResult | null>(null);
  const [loadingDeepCompare, setLoadingDeepCompare] = useState(false);

  const fetchTests = useCallback(async () => {
    try {
      setTests(await getABTests());
    } catch { showToast("A/Bテストの取得に失敗しました", "error"); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  const handleCreate = async () => {
    if (!name.trim() || videoAId === "" || videoBId === "" || !metric) {
      showToast("すべての項目を入力してください", "error"); return;
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

  const handleDeepCompare = async () => {
    if (deepCompareIdA === "" || deepCompareIdB === "") {
      showToast("2つの動画を選択してください", "error"); return;
    }
    if (deepCompareIdA === deepCompareIdB) {
      showToast("異なる動画を選択してください", "error"); return;
    }
    try {
      setLoadingDeepCompare(true);
      setDeepCompareResult(null);
      const result = await runABDeepComparison(Number(deepCompareIdA), Number(deepCompareIdB));
      setDeepCompareResult(result as ABDeepComparisonResult);
      showToast("AI詳細比較が完了しました", "success");
    } catch (e) {
      showToast(getErrorMessage(e, "AI比較に失敗しました"), "error");
    } finally {
      setLoadingDeepCompare(false);
    }
  };

  const transcribedVideos = videos.filter((v) => v.status === "transcribed");
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">新規 A/B テスト</h3>
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
            <option value="">比較指標</option>
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
                  <option value="running">実行中</option>
                  <option value="completed">完了</option>
                </select>
                <button onClick={() => handleViewResult(t)} className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  結果表示
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

      {/* ===== AI Deep Comparison ===== */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-1">AI 詳細比較</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          2つの動画を AI が詳細比較し、ペルソナ適合度、訴求力、構成の差分を分析します。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select value={deepCompareIdA} onChange={(e) => setDeepCompareIdA(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none min-w-[160px]">
            <option value="">動画A</option>
            {transcribedVideos.map((v) => <option key={v.id} value={v.id}>{v.filename}</option>)}
          </select>
          <span className="text-sm font-bold text-indigo-400 dark:text-indigo-500">vs</span>
          <select value={deepCompareIdB} onChange={(e) => setDeepCompareIdB(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-indigo-300 dark:border-indigo-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none min-w-[160px]">
            <option value="">動画B</option>
            {transcribedVideos.map((v) => <option key={v.id} value={v.id}>{v.filename}</option>)}
          </select>
          <button onClick={handleDeepCompare} disabled={loadingDeepCompare}
            className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all">
            {loadingDeepCompare ? "分析中..." : "AI 詳細比較"}
          </button>
        </div>
        {loadingDeepCompare && (
          <div className="mt-4 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-r-transparent" />
            <span className="text-sm text-indigo-600 dark:text-indigo-400 animate-pulse">Gemini AI が詳細比較を実行中...</span>
          </div>
        )}
      </div>

      {/* Deep Comparison Result */}
      {deepCompareResult && !loadingDeepCompare && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-5">
            <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-300 mb-2">比較サマリー</h4>
            <p className="text-sm text-indigo-700 dark:text-indigo-200 leading-relaxed">{deepCompareResult.summary}</p>
          </div>

          {/* Profile Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[deepCompareResult.video_a_profile, deepCompareResult.video_b_profile].map((profile, idx) => (
              <div key={idx} className={`rounded-xl border p-5 shadow-sm ${
                idx === 0
                  ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                  : "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
              }`}>
                <h4 className={`text-sm font-bold mb-3 ${idx === 0 ? "text-blue-800 dark:text-blue-300" : "text-purple-800 dark:text-purple-300"}`}>
                  {idx === 0 ? "A" : "B"}: {profile.name}
                </h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="font-medium text-green-700 dark:text-green-400">強み: </span>
                    <span className="text-gray-700 dark:text-gray-300">{profile.strengths.join(", ")}</span>
                  </div>
                  <div>
                    <span className="font-medium text-red-700 dark:text-red-400">弱み: </span>
                    <span className="text-gray-700 dark:text-gray-300">{profile.weaknesses.join(", ")}</span>
                  </div>
                  <div className="pt-1 border-t border-gray-200 dark:border-gray-600">
                    <p className="font-medium text-gray-600 dark:text-gray-400 mb-1">ターゲットペルソナ</p>
                    <p className="text-gray-700 dark:text-gray-300">
                      {profile.target_persona.age_range} / {profile.target_persona.gender}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      興味: {profile.target_persona.interests.join(", ")}
                    </p>
                    <p className="text-gray-600 dark:text-gray-400">
                      悩み: {profile.target_persona.pain_points.join(", ")}
                    </p>
                  </div>
                  <div className="flex gap-4 pt-1">
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-gray-400">説得力</p>
                      <p className={`text-lg font-bold ${profile.persuasion_score >= 7 ? "text-green-600" : profile.persuasion_score >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                        {profile.persuasion_score}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-gray-400">構成力</p>
                      <p className={`text-lg font-bold ${profile.storytelling_score >= 7 ? "text-green-600" : profile.storytelling_score >= 5 ? "text-yellow-600" : "text-red-600"}`}>
                        {profile.storytelling_score}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Key Differences Table */}
          {deepCompareResult.key_differences.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm overflow-x-auto">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">差分インサイト</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">観点</th>
                    <th className="text-left py-2 px-3 font-medium text-blue-600 dark:text-blue-400">A</th>
                    <th className="text-left py-2 px-3 font-medium text-purple-600 dark:text-purple-400">B</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 dark:text-gray-400">勝者</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">理由</th>
                  </tr>
                </thead>
                <tbody>
                  {deepCompareResult.key_differences.map((diff, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="py-2 px-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{diff.aspect}</td>
                      <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{diff.video_a}</td>
                      <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{diff.video_b}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                          diff.winner === "A" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : diff.winner === "B" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        }`}>
                          {diff.winner}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400">{diff.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Persona Fit Analysis */}
          {deepCompareResult.persona_fit_analysis && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-5">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3">ペルソナ適合度</h4>
              <div className="grid grid-cols-3 gap-3 mb-3">
                {([
                  ["若年層向け", deepCompareResult.persona_fit_analysis.better_for_young],
                  ["シニア向け", deepCompareResult.persona_fit_analysis.better_for_older],
                  ["行動喚起向け", deepCompareResult.persona_fit_analysis.better_for_action],
                ] as const).map(([label, winner]) => (
                  <div key={label} className="rounded-lg bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 p-3 text-center">
                    <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">{label}</p>
                    <p className={`text-lg font-bold ${
                      winner === "A" ? "text-blue-600" : "text-purple-600"
                    }`}>{winner}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-200 leading-relaxed">{deepCompareResult.persona_fit_analysis.explanation}</p>
            </div>
          )}

          {/* Recommendations */}
          {deepCompareResult.recommendations.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">改善提案</h4>
              <div className="space-y-2">
                {deepCompareResult.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                      rec.target === "A" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      : rec.target === "B" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                    }`}>{rec.target}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-200">{rec.suggestion}</p>
                      <span className={`text-xs font-medium ${
                        rec.priority === "high" ? "text-red-600" : rec.priority === "medium" ? "text-yellow-600" : "text-green-600"
                      }`}>
                        優先度: {rec.priority === "high" ? "高" : rec.priority === "medium" ? "中" : "低"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
