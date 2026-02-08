import { useState, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { getDashboard, runKeywordAnalysis, runCorrelationAnalysis, runAiRecommendations } from "../api/analysis";
import { getStorageUsage, type StorageUsage } from "../api/storage";
import StorageUsageBar from "../components/StorageUsageBar";
import { formatDuration } from "../utils/format";
import type { DashboardData } from "../types";

type AnalysisStepStatus = "pending" | "running" | "done" | "error";

interface AnalysisStep {
  label: string;
  status: AnalysisStepStatus;
}

const INITIAL_STEPS: AnalysisStep[] = [
  { label: "キーワード分析", status: "pending" },
  { label: "相関分析", status: "pending" },
  { label: "AIレコメンデーション", status: "pending" },
  { label: "データ更新", status: "pending" },
];

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(INITIAL_STEPS);
  const [error, setError] = useState<string | null>(null);
  const [stepElapsed, setStepElapsed] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await getDashboard();
      setDashboard(data);
      setError(null);
    } catch (err) {
      setError("ダッシュボードデータの取得に失敗しました。");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    getStorageUsage().then(setStorageUsage).catch(() => {});
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    };
  }, []);

  const updateStep = (index: number, status: AnalysisStepStatus) => {
    setAnalysisSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status } : s))
    );
    if (status === "running") {
      setStepElapsed(0);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      stepTimerRef.current = setInterval(() => setStepElapsed((e) => e + 1), 1000);
    } else if (status === "done" || status === "error") {
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    }
  };

  const handleRunAnalysis = async () => {
    try {
      setAnalysisRunning(true);
      setError(null);
      setAnalysisSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));

      updateStep(0, "running");
      await runKeywordAnalysis();
      updateStep(0, "done");

      updateStep(1, "running");
      await runCorrelationAnalysis();
      updateStep(1, "done");

      updateStep(2, "running");
      await runAiRecommendations();
      updateStep(2, "done");

      updateStep(3, "running");
      await fetchDashboard();
      updateStep(3, "done");
    } catch (err) {
      setError("分析の実行に失敗しました。動画が書き起こし済みか確認してください。");
      setAnalysisSteps((prev) =>
        prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s))
      );
      console.error(err);
    } finally {
      setAnalysisRunning(false);
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-100 text-red-800 border border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "高";
      case "medium":
        return "中";
      case "low":
        return "低";
      default:
        return priority;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "uploaded":
        return "アップロード済";
      case "transcribing":
        return "書き起こし中";
      case "transcribed":
        return "書き起こし完了";
      case "error":
        return "エラー";
      default:
        return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "uploaded":
        return "bg-gray-100 text-gray-700";
      case "transcribing":
        return "bg-yellow-100 text-yellow-700 animate-pulse";
      case "transcribed":
        return "bg-green-100 text-green-700";
      case "error":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          <p className="mt-3 text-gray-500 dark:text-gray-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchDashboard}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (!dashboard) return null;

  const chartData = dashboard.top_keywords
    .slice(0, 15)
    .map((kw) => ({ keyword: kw.keyword, count: kw.count }))
    .reverse();

  const ai = dashboard.latest_ai_recommendations;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">ダッシュボード</h2>
        <button
          onClick={handleRunAnalysis}
          disabled={analysisRunning}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {analysisRunning ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
              分析実行中...
            </>
          ) : (
            "分析を実行"
          )}
        </button>
      </div>

      {/* Analysis step indicators */}
      {analysisRunning && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <div className="flex items-center gap-3 mb-3">
            {analysisSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`h-px w-6 ${
                    step.status === "done" || step.status === "running"
                      ? "bg-blue-400"
                      : "bg-gray-200"
                  }`} />
                )}
                <div className="flex items-center gap-1.5">
                  {step.status === "done" ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : step.status === "running" ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
                  ) : step.status === "error" ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
                      <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                  )}
                  <span className={`text-xs font-medium ${
                    step.status === "running"
                      ? "text-blue-600"
                      : step.status === "done"
                      ? "text-green-600"
                      : step.status === "error"
                      ? "text-red-600"
                      : "text-gray-400"
                  }`}>
                    {step.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {/* Overall progress bar */}
          {(() => {
            const doneCount = analysisSteps.filter((s) => s.status === "done").length;
            const total = analysisSteps.length;
            const pct = Math.round((doneCount / total) * 100);
            const runningStep = analysisSteps.find((s) => s.status === "running");
            return (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {runningStep ? `${runningStep.label}を実行中...` : "処理中..."}
                  </span>
                  <span className="text-xs font-medium text-gray-600">
                    {doneCount}/{total} 完了{stepElapsed > 0 ? ` (${stepElapsed}秒)` : ""}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">動画総数</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">{dashboard.total_videos}</p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">書き起こし完了</p>
          <p className="mt-1.5 text-2xl font-bold text-green-600">
            {dashboard.transcribed_videos}
            <span className="ml-1 text-sm font-normal text-gray-400">
              / {dashboard.total_videos}
            </span>
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">処理中 / エラー</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">
            {dashboard.processing_videos > 0 && (
              <span className="text-yellow-600">{dashboard.processing_videos}</span>
            )}
            {dashboard.processing_videos > 0 && dashboard.error_videos > 0 && (
              <span className="text-gray-400 mx-1">/</span>
            )}
            {dashboard.error_videos > 0 && (
              <span className="text-red-600">{dashboard.error_videos}</span>
            )}
            {dashboard.processing_videos === 0 && dashboard.error_videos === 0 && (
              <span className="text-gray-300">---</span>
            )}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">平均再生時間</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900 dark:text-white">
            {dashboard.avg_duration_seconds != null
              ? formatDuration(dashboard.avg_duration_seconds)
              : "---"}
          </p>
        </div>
        <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">CV指標登録数</p>
          <p className="mt-1.5 text-2xl font-bold text-blue-600">{dashboard.total_conversions}</p>
        </div>
      </div>

      {/* Storage usage */}
      {storageUsage && (
        <div className="rounded-xl bg-white dark:bg-gray-800 px-6 py-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <StorageUsageBar usedBytes={storageUsage.usedBytes} limitBytes={storageUsage.limitBytes} />
        </div>
      )}

      {/* Top keywords chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">トップキーワード</h3>
          <div style={{ width: "100%", height: Math.max(chartData.length * 32, 200) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 100, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  width={90}
                  tick={{ fontSize: 13 }}
                />
                <Tooltip
                  formatter={(value) => [`${value}回`, "出現回数"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Video comparison table */}
      {dashboard.video_summaries.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">動画比較</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">ファイル名</th>
                  <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">ステータス</th>
                  <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">再生時間</th>
                  <th className="px-6 py-3 font-medium text-gray-500 dark:text-gray-400">コンバージョン指標</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dashboard.video_summaries.map((vs) => (
                  <tr key={vs.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-900 dark:text-white max-w-[240px] truncate">
                      {vs.filename}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadge(vs.status)}`}
                      >
                        {getStatusLabel(vs.status)}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-gray-300">
                      {formatDuration(vs.duration_seconds)}
                    </td>
                    <td className="px-6 py-3">
                      {Object.keys(vs.conversions).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(vs.conversions).map(([key, val]) => (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                            >
                              {key}: <span className="font-semibold">{val}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">データなし</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      {ai && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AIレコメンデーション</h3>

          {/* Summary */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-5">
            <h4 className="mb-1 text-sm font-semibold text-blue-800">概要</h4>
            <p className="text-sm leading-relaxed text-blue-900">{ai.summary}</p>
          </div>

          {/* Effective Keywords */}
          {ai.effective_keywords.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h4 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">効果的なキーワード</h4>
              <ul className="space-y-2">
                {ai.effective_keywords.map((ek, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
                  >
                    <span className="mt-0.5 shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                      {ek.keyword}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">{ek.reason}</p>
                      {ek.appears_in.length > 0 && (
                        <p className="mt-1 text-xs text-gray-400">
                          出現動画: {ek.appears_in.join("、")}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {ai.recommendations.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h4 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">改善提案</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ai.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{rec.category}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPriorityBadge(rec.priority)}`}
                      >
                        {getPriorityLabel(rec.priority)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-600">{rec.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Funnel Suggestions */}
          {ai.funnel_suggestions.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h4 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">ファネル改善提案</h4>
              <ol className="space-y-3">
                {ai.funnel_suggestions.map((fs, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{fs.stage}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{fs.suggestion}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
