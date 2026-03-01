import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from "recharts";
import { getVideos } from "../api/videos";
import { getConversionSummary } from "../api/conversions";
import { getDashboard, runMarketingReport, getAnalysisResults, runContentSuggestion, runKeywordAnalysis, runCorrelationAnalysis, runAiRecommendations } from "../api/analysis";
import { getManagedTags } from "../api/settings";
import { getAllAdPerformance } from "../api/adPerformance";
import { generateMarketingPptx } from "../utils/pptxExport";
import { getErrorMessage } from "../utils/errors";
import { formatDuration } from "../utils/format";
import Toast from "../components/Toast";
import { useToast } from "../components/useToast";
import PlatformTab from "../components/marketing/PlatformTab";
import AnalysisHistoryTab from "../components/marketing/AnalysisHistoryTab";
import RankingInsightTab from "../components/marketing/RankingInsightTab";
import StrategyTab from "../components/marketing/StrategyTab";
import KnowledgeBaseTab from "../components/marketing/KnowledgeBaseTab";
import type { Video, ConversionSummary, MarketingReportResult, ContentSuggestion, DashboardData, AdPerformance } from "../types";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

type AnalysisStepStatus = "pending" | "running" | "done" | "error";
interface AnalysisStep { label: string; status: AnalysisStepStatus; }
const INITIAL_STEPS: AnalysisStep[] = [
  { label: "キーワード分析", status: "pending" },
  { label: "相関分析", status: "pending" },
  { label: "AIレコメンデーション", status: "pending" },
  { label: "データ更新", status: "pending" },
];

type Tab = "overview" | "compare" | "trend" | "ranking_insight" | "strategy" | "knowledge" | "report" | "platform" | "history";

export default function MarketingDashboardPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [convSummaries, setConvSummaries] = useState<ConversionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { toast, showToast, clearToast } = useToast();

  // Compare tab state
  const [selectedVideoIds, setSelectedVideoIds] = useState<number[]>([]);

  // Trend tab state
  const [selectedMetric, setSelectedMetric] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");

  // Report tab state
  const [report, setReport] = useState<MarketingReportResult | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [reportLoaded, setReportLoaded] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [contentSuggestion, setContentSuggestion] = useState<ContentSuggestion | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);

  // Managed tags
  const [managedTags, setManagedTags] = useState<string[]>([]);

  // Ad performance data
  const [adPerfList, setAdPerfList] = useState<AdPerformance[]>([]);

  // Dashboard integration
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>(INITIAL_STEPS);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [stepElapsed, setStepElapsed] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [vData, cData, tags, dashData, adPerf] = await Promise.all([
        getVideos(1, 1000),
        getConversionSummary(),
        getManagedTags().catch(() => [] as string[]),
        getDashboard().catch(() => null as DashboardData | null),
        getAllAdPerformance().catch(() => [] as AdPerformance[]),
      ]);
      setVideos(vData.videos);
      setConvSummaries(cData);
      setManagedTags(tags);
      setDashboard(dashData);
      setAdPerfList(adPerf);
    } catch {
      showToast("データの取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cleanup analysis timer on unmount
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    };
  }, []);

  const updateStep = (index: number, status: AnalysisStepStatus) => {
    setAnalysisSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)));
    if (status === "running") {
      setStepElapsed(0);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      stepTimerRef.current = setInterval(() => setStepElapsed((e) => e + 1), 1000);
    } else if (status === "done" || status === "error") {
      if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    }
  };

  const handleRunAnalysis = async () => {
    try {
      setAnalysisRunning(true);
      setAnalysisError(null);
      setAnalysisSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));
      updateStep(0, "running"); await runKeywordAnalysis(); updateStep(0, "done");
      updateStep(1, "running"); await runCorrelationAnalysis(); updateStep(1, "done");
      updateStep(2, "running"); await runAiRecommendations(); updateStep(2, "done");
      updateStep(3, "running"); await fetchData(); updateStep(3, "done");
    } catch {
      setAnalysisError("分析の実行に失敗しました。動画が書き起こし済みか確認してください。");
      setAnalysisSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
    } finally {
      setAnalysisRunning(false);
      if (stepTimerRef.current) { clearInterval(stepTimerRef.current); stepTimerRef.current = null; }
    }
  };

  // Load latest report when tab is first opened
  useEffect(() => {
    if (activeTab === "report" && !reportLoaded) {
      setReportLoaded(true);
      getAnalysisResults("marketing_report").then((results) => {
        if (results.length > 0) setReport(results[0].result as MarketingReportResult);
      }).catch(() => { });
    }
  }, [activeTab, reportLoaded]);

  // Ad performance map (code → AdPerformance)
  const adPerfMap = useMemo(() => {
    const map = new Map<string, AdPerformance>();
    for (const ap of adPerfList) map.set(ap.code, ap);
    return map;
  }, [adPerfList]);

  // Top videos by 事業貢献スコア
  const topByScore = useMemo(() => {
    const scored = videos
      .filter((v) => v.code && adPerfMap.has(v.code))
      .map((v) => ({ video: v, ad: adPerfMap.get(v.code!)! }))
      .filter((x) => x.ad.score !== null)
      .sort((a, b) => (b.ad.score ?? 0) - (a.ad.score ?? 0))
      .slice(0, 5);
    return scored;
  }, [videos, adPerfMap]);

  // Collect all unique metric names and tags
  const allMetrics = useMemo(() => {
    const set = new Set<string>();
    for (const s of convSummaries) Object.keys(s.metrics).forEach((k) => set.add(k));
    return Array.from(set);
  }, [convSummaries]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const v of videos) (v.tags ?? []).forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [videos]);

  // Set default selected metric
  useEffect(() => {
    if (!selectedMetric && allMetrics.length > 0) setSelectedMetric(allMetrics[0]);
  }, [allMetrics, selectedMetric]);

  // Filter videos by tag
  const filteredVideos = useMemo(() => {
    if (!tagFilter) return videos;
    return videos.filter((v) => (v.tags ?? []).includes(tagFilter));
  }, [videos, tagFilter]);

  const filteredConvSummaries = useMemo(() => {
    if (!tagFilter) return convSummaries;
    const ids = new Set(filteredVideos.map((v) => v.id));
    return convSummaries.filter((s) => ids.has(s.video_id));
  }, [convSummaries, tagFilter, filteredVideos]);

  // ===== Overview: conversion comparison bar chart data =====
  const convBarData = useMemo(() => {
    return filteredConvSummaries.map((s) => ({
      name: s.video_filename.length > 12 ? s.video_filename.slice(0, 12) + "..." : s.video_filename,
      fullName: s.video_filename,
      ...s.metrics,
    }));
  }, [filteredConvSummaries]);

  // ===== Overview: top/worst performers =====
  const performers = useMemo(() => {
    if (allMetrics.length === 0 || filteredConvSummaries.length < 2) return null;
    // Use first metric for ranking
    const metric = allMetrics[0];
    const sorted = [...filteredConvSummaries]
      .filter((s) => s.metrics[metric] !== undefined)
      .sort((a, b) => (b.metrics[metric] ?? 0) - (a.metrics[metric] ?? 0));
    return {
      metric,
      top: sorted.slice(0, 3),
      bottom: sorted.slice(-3).reverse(),
    };
  }, [filteredConvSummaries, allMetrics]);

  // ===== Compare: radar chart data =====
  const radarData = useMemo(() => {
    if (selectedVideoIds.length < 2 || allMetrics.length === 0) return [];
    const selected = convSummaries.filter((s) => selectedVideoIds.includes(s.video_id));
    // Normalize each metric to 0-100
    const mins: Record<string, number> = {};
    const maxes: Record<string, number> = {};
    for (const m of allMetrics) {
      const vals = convSummaries.map((s) => s.metrics[m]).filter((v) => v !== undefined) as number[];
      mins[m] = Math.min(...vals, 0);
      maxes[m] = Math.max(...vals, 1);
    }
    return allMetrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      for (const s of selected) {
        const raw = s.metrics[metric] ?? 0;
        const range = maxes[metric] - mins[metric];
        row[s.video_filename] = range > 0 ? Math.round(((raw - mins[metric]) / range) * 100) : 50;
      }
      return row;
    });
  }, [selectedVideoIds, convSummaries, allMetrics]);

  const radarVideoNames = useMemo(() => {
    return convSummaries
      .filter((s) => selectedVideoIds.includes(s.video_id))
      .map((s) => s.video_filename);
  }, [selectedVideoIds, convSummaries]);

  // ===== Compare: comparison table =====
  const compareTableData = useMemo(() => {
    const selected = convSummaries.filter((s) => selectedVideoIds.includes(s.video_id));
    return allMetrics.map((metric) => ({
      metric,
      values: selected.map((s) => ({ name: s.video_filename, value: s.metrics[metric] ?? "-" })),
    }));
  }, [selectedVideoIds, convSummaries, allMetrics]);

  // ===== Trend: line chart data =====
  const trendData = useMemo(() => {
    if (!selectedMetric) return [];
    const data = filteredVideos
      .filter((v) => v.status === "transcribed")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((v) => {
        const summary = convSummaries.find((s) => s.video_id === v.id);
        return {
          name: v.filename.length > 10 ? v.filename.slice(0, 10) + "..." : v.filename,
          fullName: v.filename,
          value: summary?.metrics[selectedMetric] ?? null,
          date: v.created_at.slice(0, 10),
        };
      })
      .filter((d) => d.value !== null);
    return data;
  }, [filteredVideos, convSummaries, selectedMetric]);

  // ===== Report handlers =====
  const handleGenerateReport = async () => {
    try {
      setLoadingReport(true);
      const result = await runMarketingReport(customPrompt || undefined);
      setReport(result as MarketingReportResult);
      showToast("マーケティングレポートを生成しました", "success");
    } catch (e) {
      showToast(getErrorMessage(e, "レポート生成に失敗しました"), "error");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleExportReport = () => {
    if (!report) return;
    const html = generateReportHtml(report);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `マーケティングレポート_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPptx = async () => {
    if (!report) return;
    try {
      setExportingPptx(true);
      await generateMarketingPptx(report, convSummaries);
      showToast("PPTXをダウンロードしました", "success");
    } catch (e) {
      showToast(getErrorMessage(e, "PPTX生成に失敗しました"), "error");
    } finally {
      setExportingPptx(false);
    }
  };

  const handleContentSuggestion = async () => {
    try {
      setLoadingSuggestion(true);
      const result = await runContentSuggestion(customPrompt || undefined);
      setContentSuggestion(result as ContentSuggestion);
      showToast("AI台本提案を生成しました", "success");
    } catch (e) {
      showToast(getErrorMessage(e, "台本提案の生成に失敗しました"), "error");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "概要" },
    { key: "compare", label: "動画比較" },
    { key: "trend", label: "推移" },
    { key: "ranking_insight", label: "ランキングインサイト" },
    { key: "strategy", label: "戦略提案" },
    { key: "knowledge", label: "ナレッジ" },
    { key: "report", label: "レポート" },
    { key: "platform", label: "媒体分析" },
    { key: "history", label: "分析履歴" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          <p className="mt-3 text-gray-500 dark:text-gray-400">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">ダッシュボード</h2>
        <div className="flex items-center gap-3">
          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">タグ絞込:</span>
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">全て</option>
                {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
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
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== Overview Tab ===== */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Analysis step indicators */}
          {analysisRunning && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                {analysisSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && <div className={`h-px w-6 ${step.status === "done" || step.status === "running" ? "bg-blue-400" : "bg-gray-200"}`} />}
                    <div className="flex items-center gap-1.5">
                      {step.status === "done" ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                      ) : step.status === "running" ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
                      ) : step.status === "error" ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500">
                          <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                      )}
                      <span className={`text-xs font-medium ${step.status === "running" ? "text-blue-600" : step.status === "done" ? "text-green-600" : step.status === "error" ? "text-red-600" : "text-gray-400"}`}>{step.label}</span>
                    </div>
                  </div>
                ))}
              </div>
              {(() => {
                const doneCount = analysisSteps.filter((s) => s.status === "done").length;
                const total = analysisSteps.length;
                const pct = Math.round((doneCount / total) * 100);
                const runningStep = analysisSteps.find((s) => s.status === "running");
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">{runningStep ? `${runningStep.label}を実行中...` : "処理中..."}</span>
                      <span className="text-xs font-medium text-gray-600">{doneCount}/{total} 完了{stepElapsed > 0 ? ` (${stepElapsed}秒)` : ""}</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Analysis error */}
          {analysisError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{analysisError}</div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">動画総数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{dashboard?.total_videos ?? filteredVideos.length}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">書き起こし完了</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {dashboard?.transcribed_videos ?? "---"}
                <span className="ml-1 text-sm font-normal text-gray-400">/ {dashboard?.total_videos ?? filteredVideos.length}</span>
              </p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">広告実績データ登録数</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{adPerfList.length}<span className="ml-1 text-sm font-normal text-gray-400">件</span></p>
            </div>
          </div>



          {/* 事業貢献スコア トップ動画 */}
          {topByScore.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">
                事業貢献スコア トップ動画
                <span className="ml-2 text-xs font-normal text-gray-400">（広告実績データより）</span>
              </h3>
              <div className="space-y-2">
                {topByScore.map(({ video, ad }, i) => (
                  <div key={video.id} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{video.filename}</span>
                        <span className="text-xs text-gray-400 font-mono shrink-0">{video.code}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0">{ad.media}</span>
                      </div>
                      <div className="mt-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${Math.min((ad.score ?? 0) / (topByScore[0].ad.score ?? 1) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{(ad.score ?? 0).toFixed(1)}</p>
                      <p className="text-xs text-gray-400">ROI {ad.roi !== null ? `${ad.roi.toFixed(0)}%` : "—"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top keywords chart */}
          {(() => {
            const chartData = (dashboard?.top_keywords ?? []).slice(0, 15).map((kw) => ({ keyword: kw.keyword, count: kw.count })).reverse();
            if (chartData.length === 0) return null;
            return (
              <div className="rounded-xl bg-white dark:bg-gray-800 p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">トップキーワード</h3>
                <div style={{ width: "100%", height: Math.max(chartData.length * 32, 200) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 100, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis type="category" dataKey="keyword" width={90} tick={{ fontSize: 13 }} />
                      <Tooltip formatter={(value) => [`${value}回`, "出現回数"]} contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* Conversion comparison bar chart */}
          {convBarData.length > 0 ? (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">動画別コンバージョン比較</h3>
              <ResponsiveContainer width="100%" height={Math.max(300, convBarData.length * 40 + 80)}>
                <BarChart data={convBarData} layout="vertical" margin={{ left: 100, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 12 }} />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (!payload?.length) return null;
                      const fullName = payload[0]?.payload?.fullName ?? label;
                      return (
                        <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-2 shadow-lg">
                          <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{fullName}</p>
                          {payload.map((p: { dataKey?: string | number; color?: string; value?: string | number }) => (
                            <p key={p.dataKey} className="text-xs text-gray-600 dark:text-gray-300">
                              <span style={{ color: p.color }}>{p.dataKey}: </span>
                              <span className="font-medium">{p.value}</span>
                            </p>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  {allMetrics.map((metric, i) => (
                    <Bar key={metric} dataKey={metric} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-8 shadow-sm text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">コンバージョンデータが登録されていません。動画詳細ページからデータを追加してください。</p>
            </div>
          )}

          {/* Top/Bottom performers */}
          {performers && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-5">
                <h3 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-3">Top パフォーマー ({performers.metric})</h3>
                <div className="space-y-2">
                  {performers.top.map((s, i) => (
                    <div key={s.video_id} className="flex items-center justify-between">
                      <span className="text-sm text-green-700 dark:text-green-300">
                        <span className="font-bold mr-1">{i + 1}.</span>
                        {s.video_filename}
                      </span>
                      <span className="text-sm font-bold text-green-900 dark:text-green-200 tabular-nums">
                        {s.metrics[performers.metric]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-5">
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-3">要改善 ({performers.metric})</h3>
                <div className="space-y-2">
                  {performers.bottom.map((s, i) => (
                    <div key={s.video_id} className="flex items-center justify-between">
                      <span className="text-sm text-red-700 dark:text-red-300">
                        <span className="font-bold mr-1">{i + 1}.</span>
                        {s.video_filename}
                      </span>
                      <span className="text-sm font-bold text-red-900 dark:text-red-200 tabular-nums">
                        {s.metrics[performers.metric]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Video comparison table */}
          {dashboard && dashboard.video_summaries.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">動画一覧</h3>
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
                        <td className="px-6 py-3 font-medium text-gray-900 dark:text-white max-w-[240px] truncate">{vs.filename}</td>
                        <td className="px-6 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${vs.status === "transcribed" ? "bg-green-100 text-green-700"
                            : vs.status === "transcribing" ? "bg-yellow-100 text-yellow-700 animate-pulse"
                              : vs.status === "error" ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}>
                            {vs.status === "uploaded" ? "アップロード済" : vs.status === "transcribing" ? "書き起こし中" : vs.status === "transcribed" ? "書き起こし完了" : vs.status === "error" ? "エラー" : vs.status}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-600 dark:text-gray-300">{formatDuration(vs.duration_seconds)}</td>
                        <td className="px-6 py-3">
                          {Object.keys(vs.conversions).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(vs.conversions).map(([key, val]) => (
                                <span key={key} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
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
          {dashboard?.latest_ai_recommendations && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">AIレコメンデーション</h3>
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
                <h4 className="mb-1 text-sm font-semibold text-blue-800 dark:text-blue-300">概要</h4>
                <p className="text-sm leading-relaxed text-blue-900 dark:text-blue-200">{dashboard.latest_ai_recommendations.summary}</p>
              </div>
              {dashboard.latest_ai_recommendations.effective_keywords.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">効果的なキーワード</h4>
                  <ul className="space-y-2">
                    {dashboard.latest_ai_recommendations.effective_keywords.map((ek, i) => (
                      <li key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 dark:bg-gray-700/50 dark:border-gray-600 p-3">
                        <span className="mt-0.5 shrink-0 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{ek.keyword}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{ek.reason}</p>
                          {ek.appears_in.length > 0 && <p className="mt-1 text-xs text-gray-400">出現動画: {ek.appears_in.join("、")}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dashboard.latest_ai_recommendations.recommendations.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                  <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">改善提案</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dashboard.latest_ai_recommendations.recommendations.map((rec, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-600 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{rec.category}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${rec.priority.toLowerCase() === "high" ? "bg-red-100 text-red-800 border border-red-200"
                            : rec.priority.toLowerCase() === "medium" ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                              : "bg-green-100 text-green-800 border border-green-200"
                            }`}>
                            {rec.priority.toLowerCase() === "high" ? "高" : rec.priority.toLowerCase() === "medium" ? "中" : rec.priority.toLowerCase() === "low" ? "低" : rec.priority}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{rec.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Compare Tab ===== */}
      {activeTab === "compare" && (
        <div className="space-y-6">
          {/* Video selection */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">比較する動画を選択（2〜4本）</h3>
            <div className="flex flex-wrap gap-2">
              {convSummaries.map((s) => {
                const sel = selectedVideoIds.includes(s.video_id);
                return (
                  <button
                    key={s.video_id}
                    onClick={() => {
                      setSelectedVideoIds((prev) =>
                        sel
                          ? prev.filter((id) => id !== s.video_id)
                          : prev.length >= 4
                            ? prev
                            : [...prev, s.video_id]
                      );
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${sel
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                  >
                    {s.video_filename}
                  </button>
                );
              })}
            </div>
            {convSummaries.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">コンバージョンデータのある動画がありません。</p>
            )}
          </div>

          {/* Radar chart */}
          {radarData.length > 0 && radarVideoNames.length >= 2 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">パフォーマンス比較（正規化 0-100）</h3>
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  {radarVideoNames.map((name, i) => (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
                      stroke={COLORS[i % COLORS.length]}
                      fill={COLORS[i % COLORS.length]}
                      fillOpacity={0.15}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comparison table */}
          {compareTableData.length > 0 && selectedVideoIds.length >= 2 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm overflow-x-auto">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">数値比較</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">指標</th>
                    {compareTableData[0]?.values.map((v) => (
                      <th key={v.name} className="text-right py-2 px-3 font-medium text-gray-700 dark:text-gray-200 max-w-[150px] truncate">
                        {v.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compareTableData.map((row) => {
                    const numVals = row.values.filter((v) => typeof v.value === "number").map((v) => v.value as number);
                    const maxVal = numVals.length > 0 ? Math.max(...numVals) : null;
                    return (
                      <tr key={row.metric} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 px-3 font-medium text-gray-700 dark:text-gray-300">{row.metric}</td>
                        {row.values.map((v) => (
                          <td
                            key={v.name}
                            className={`text-right py-2 px-3 tabular-nums ${typeof v.value === "number" && v.value === maxVal
                              ? "font-bold text-blue-600 dark:text-blue-400"
                              : "text-gray-600 dark:text-gray-300"
                              }`}
                          >
                            {v.value}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== Trend Tab ===== */}
      {activeTab === "trend" && (
        <div className="space-y-6">
          {/* Metric selector */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">指標:</span>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Line chart */}
          {trendData.length > 0 ? (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                {selectedMetric} の推移（動画作成日順）
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={trendData} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-2 shadow-lg">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">{d?.fullName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{d?.date}</p>
                          <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">
                            {selectedMetric}: {d?.value}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#3b82f6" }}
                    activeDot={{ r: 6 }}
                    name={selectedMetric}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-8 shadow-sm text-center">
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {allMetrics.length === 0
                  ? "コンバージョンデータが登録されていません。"
                  : `「${selectedMetric}」のデータがある動画がありません。`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== Report Tab ===== */}
      {activeTab === "report" && (
        <div className="space-y-6">
          {/* Generate form */}
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">マーケティング総合レポート生成</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Gemini AIが全動画のデータを分析し、ターゲット分析・競合優位性・改善提案・次回動画の方向性を含む包括的レポートを生成します。
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="追加の分析指示（任意）: 例）20代女性をターゲットにした場合の分析を重視してください"
              rows={2}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-200 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none mb-3"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateReport}
                disabled={loadingReport}
                className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all"
              >
                {loadingReport ? "生成中..." : "レポート生成"}
              </button>
              {report && (
                <>
                  <button
                    onClick={handleExportReport}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    HTMLエクスポート
                  </button>
                  <button
                    onClick={handleExportPptx}
                    disabled={exportingPptx}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    {exportingPptx ? "生成中..." : "PPTXエクスポート"}
                  </button>
                </>
              )}
              <button
                onClick={handleContentSuggestion}
                disabled={loadingSuggestion}
                className="rounded-lg bg-gradient-to-r from-green-600 to-teal-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-green-700 hover:to-teal-700 disabled:opacity-50 transition-all"
              >
                {loadingSuggestion ? "生成中..." : "AI台本提案"}
              </button>
            </div>
            {loadingReport && (
              <div className="mt-4 flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
                <span className="text-sm text-blue-600 dark:text-blue-400 animate-pulse">Gemini AIが分析中...</span>
              </div>
            )}
          </div>

          {/* Report results */}
          {report && (
            <div className="space-y-5">
              {/* Executive summary */}
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">エグゼクティブサマリー</h4>
                <p className="text-sm text-blue-700 dark:text-blue-200 leading-relaxed">{report.executive_summary}</p>
              </div>

              {/* Target audience */}
              {report.target_audience_analysis?.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">ターゲット分析</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {report.target_audience_analysis.map((ta, i) => (
                      <div key={i} className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4">
                        <p className="text-sm font-bold text-purple-800 dark:text-purple-300">{ta.segment}</p>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{ta.description}</p>
                        {ta.key_messages?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {ta.key_messages.map((m, j) => (
                              <span key={j} className="inline-block rounded bg-purple-100 dark:bg-purple-800/40 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300">{m}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content performance matrix */}
              {report.content_performance_matrix?.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">コンテンツ評価マトリクス</h4>
                  <div className="space-y-3">
                    {report.content_performance_matrix.map((item, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">{item.video_name}</span>
                          <span className={`text-sm font-bold tabular-nums ${item.overall_score >= 7 ? "text-green-600" : item.overall_score >= 5 ? "text-yellow-600" : "text-red-600"
                            }`}>
                            {item.overall_score}/10
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="font-medium text-green-700 dark:text-green-400">強み: </span>
                            <span className="text-gray-600 dark:text-gray-300">{item.strengths?.join(", ")}</span>
                          </div>
                          <div>
                            <span className="font-medium text-red-700 dark:text-red-400">弱み: </span>
                            <span className="text-gray-600 dark:text-gray-300">{item.weaknesses?.join(", ")}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Competitive advantages */}
              {report.competitive_advantages?.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">競合優位性</h4>
                  <div className="space-y-2">
                    {report.competitive_advantages.map((ca, i) => (
                      <div key={i} className="rounded-lg bg-green-50 dark:bg-green-900/20 p-3">
                        <p className="text-sm font-medium text-green-800 dark:text-green-300">{ca.advantage}</p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{ca.evidence}</p>
                        <p className="text-xs text-green-700 dark:text-green-300 mt-1 font-medium">活用: {ca.leverage_suggestion}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Improvement priorities */}
              {report.improvement_priorities?.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">改善優先度</h4>
                  <div className="space-y-2">
                    {report.improvement_priorities.map((ip, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${ip.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : ip.priority === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}>
                          {ip.priority === "high" ? "高" : ip.priority === "medium" ? "中" : "低"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{ip.area}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ip.recommended_action}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">期待効果: {ip.expected_impact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next video direction */}
              {report.next_video_direction && (
                <div className="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 p-5">
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">次回動画の方向性</h4>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium text-blue-800 dark:text-blue-300">テーマ:</span> <span className="text-blue-700 dark:text-blue-200">{report.next_video_direction.theme}</span></p>
                    <p><span className="font-medium text-blue-800 dark:text-blue-300">推奨構成:</span> <span className="text-blue-700 dark:text-blue-200">{report.next_video_direction.recommended_structure}</span></p>
                    <p><span className="font-medium text-blue-800 dark:text-blue-300">感情曲線:</span> <span className="text-blue-700 dark:text-blue-200">{report.next_video_direction.target_emotion_arc}</span></p>
                    {report.next_video_direction.key_messages?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {report.next_video_direction.key_messages.map((m, i) => (
                          <span key={i} className="rounded bg-blue-100 dark:bg-blue-800/40 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-300">{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Content Suggestion */}
          {loadingSuggestion && (
            <div className="flex items-center justify-center py-8 gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-r-transparent" />
              <span className="text-sm text-green-600 dark:text-green-400 animate-pulse">AIが台本を提案中...</span>
            </div>
          )}
          {contentSuggestion && !loadingSuggestion && (
            <div className="rounded-xl bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-200 dark:border-green-800 p-5">
              <h4 className="text-sm font-semibold text-green-900 dark:text-green-300 mb-3">AI台本提案</h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300 mb-1">台本構成:</p>
                  <p className="text-green-700 dark:text-green-200 whitespace-pre-line">{contentSuggestion.script_outline}</p>
                </div>
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300 mb-1">推奨構成:</p>
                  <p className="text-green-700 dark:text-green-200">{contentSuggestion.recommended_structure}</p>
                </div>
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300 mb-1">タイミングガイド:</p>
                  <p className="text-green-700 dark:text-green-200">{contentSuggestion.timing_guide}</p>
                </div>
                <div>
                  <p className="font-medium text-green-800 dark:text-green-300 mb-1">感情曲線:</p>
                  <p className="text-green-700 dark:text-green-200">{contentSuggestion.target_emotion_arc}</p>
                </div>
                {contentSuggestion.key_messages?.length > 0 && (
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300 mb-1">キーメッセージ:</p>
                    <div className="flex flex-wrap gap-1">
                      {contentSuggestion.key_messages.map((m, i) => (
                        <span key={i} className="rounded bg-green-100 dark:bg-green-800/40 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">{m}</span>
                      ))}
                    </div>
                  </div>
                )}
                {contentSuggestion.reference_videos?.length > 0 && (
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300 mb-1">参考動画:</p>
                    <p className="text-green-700 dark:text-green-200">{contentSuggestion.reference_videos.join(", ")}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== Ranking Insight Tab ===== */}
      {activeTab === "ranking_insight" && (
        <RankingInsightTab managedTags={managedTags} showToast={showToast} />
      )}

      {/* ===== Strategy Tab ===== */}
      {activeTab === "strategy" && (
        <StrategyTab
          videos={filteredVideos}
          adPerfList={adPerfList}
          adPerfMap={adPerfMap}
          managedTags={managedTags}
          showToast={showToast}
        />
      )}

      {/* ===== Knowledge Base Tab ===== */}
      {activeTab === "knowledge" && (
        <KnowledgeBaseTab
          videos={filteredVideos}
          adPerfMap={adPerfMap}
          adPerfList={adPerfList}
          dashboard={dashboard}
        />
      )}

      {/* ===== Platform Tab ===== */}
      {activeTab === "platform" && (
        <PlatformTab
          videos={filteredVideos}
          convSummaries={filteredConvSummaries}
          allMetrics={allMetrics}
          managedTags={managedTags}
          showToast={showToast}
          onVideoUpdate={fetchData}
        />
      )}

      {/* ===== History Tab ===== */}
      {activeTab === "history" && (
        <AnalysisHistoryTab />
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}

// ===== HTML Report Export =====
function generateReportHtml(report: MarketingReportResult): string {
  const date = new Date().toLocaleDateString("ja-JP");
  const section = (title: string, content: string) =>
    `<div style="margin-bottom:24px"><h2 style="color:#1e40af;border-bottom:2px solid #3b82f6;padding-bottom:8px;margin-bottom:12px">${title}</h2>${content}</div>`;

  const targetHtml = (report.target_audience_analysis ?? []).map((t) =>
    `<div style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:8px;padding:12px;margin-bottom:8px">
      <strong>${t.segment}</strong><br><span style="color:#6b21a8">${t.description}</span>
      ${t.key_messages?.length ? `<div style="margin-top:6px">${t.key_messages.map((m) => `<span style="background:#ede9fe;padding:2px 8px;border-radius:4px;font-size:12px;margin-right:4px">${m}</span>`).join("")}</div>` : ""}
    </div>`
  ).join("");

  const matrixHtml = (report.content_performance_matrix ?? []).map((c) =>
    `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb"><strong>${c.video_name}</strong></td>
     <td style="padding:8px;border-bottom:1px solid #e5e7eb;color:${c.overall_score >= 7 ? "#16a34a" : c.overall_score >= 5 ? "#ca8a04" : "#dc2626"};font-weight:bold">${c.overall_score}/10</td>
     <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#16a34a">${c.strengths?.join(", ") ?? ""}</td>
     <td style="padding:8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#dc2626">${c.weaknesses?.join(", ") ?? ""}</td></tr>`
  ).join("");

  const improvementsHtml = (report.improvement_priorities ?? []).map((ip) =>
    `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px">
      <span style="background:${ip.priority === "high" ? "#fee2e2;color:#b91c1c" : ip.priority === "medium" ? "#fef3c7;color:#a16207" : "#dcfce7;color:#15803d"};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:bold">${ip.priority === "high" ? "高" : ip.priority === "medium" ? "中" : "低"}</span>
      <strong style="margin-left:8px">${ip.area}</strong>
      <div style="font-size:13px;color:#4b5563;margin-top:4px">${ip.recommended_action}</div>
      <div style="font-size:12px;color:#2563eb;margin-top:4px">期待効果: ${ip.expected_impact}</div>
    </div>`
  ).join("");

  const nd = report.next_video_direction;
  const nextHtml = nd ? `
    <div style="background:linear-gradient(135deg,#eff6ff,#f5f3ff);border:1px solid #93c5fd;border-radius:8px;padding:16px">
      <p><strong>テーマ:</strong> ${nd.theme}</p>
      <p><strong>推奨構成:</strong> ${nd.recommended_structure}</p>
      <p><strong>感情曲線:</strong> ${nd.target_emotion_arc}</p>
      ${nd.key_messages?.length ? `<p><strong>メッセージ:</strong> ${nd.key_messages.join(" / ")}</p>` : ""}
    </div>` : "";

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>マーケティングレポート ${date}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#1f2937;line-height:1.6}
h1{color:#1e3a5f;text-align:center;margin-bottom:8px}table{width:100%;border-collapse:collapse}</style></head><body>
<h1>マーケティング総合レポート</h1><p style="text-align:center;color:#6b7280;margin-bottom:32px">作成日: ${date}</p>
${section("エグゼクティブサマリー", `<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:16px;font-size:15px">${report.executive_summary}</div>`)}
${targetHtml ? section("ターゲット分析", targetHtml) : ""}
${matrixHtml ? section("コンテンツ評価マトリクス", `<table><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db">動画</th><th style="padding:8px;border-bottom:2px solid #d1d5db">スコア</th><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db">強み</th><th style="text-align:left;padding:8px;border-bottom:2px solid #d1d5db">弱み</th></tr>${matrixHtml}</table>`) : ""}
${(report.competitive_advantages ?? []).length > 0 ? section("競合優位性", report.competitive_advantages.map((c) => `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-bottom:8px"><strong>${c.advantage}</strong><br><span style="font-size:13px">${c.evidence}</span><br><span style="font-size:12px;color:#15803d">活用: ${c.leverage_suggestion}</span></div>`).join("")) : ""}
${improvementsHtml ? section("改善優先度", improvementsHtml) : ""}
${nextHtml ? section("次回動画の方向性", nextHtml) : ""}
<footer style="text-align:center;color:#9ca3af;font-size:12px;margin-top:48px;border-top:1px solid #e5e7eb;padding-top:16px">動画CM分析ツール マーケティングレポート</footer>
</body></html>`;
}
