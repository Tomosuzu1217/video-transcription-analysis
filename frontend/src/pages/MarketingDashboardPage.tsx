import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from "recharts";
import { getVideos } from "../api/videos";
import { getConversionSummary } from "../api/conversions";
import { runMarketingReport, getAnalysisResults, runContentSuggestion } from "../api/analysis";
import { checkAlerts } from "../api/alerts";
import { generateMarketingPptx } from "../utils/pptxExport";
import Toast, { useToast } from "../components/Toast";
import ABTestTab from "../components/marketing/ABTestTab";
import ROITab from "../components/marketing/ROITab";
import FunnelTab from "../components/marketing/FunnelTab";
import CompetitorTab from "../components/marketing/CompetitorTab";
import AlertsTab from "../components/marketing/AlertsTab";
import type { Video, ConversionSummary, MarketingReportResult, TriggeredAlert, ContentSuggestion } from "../types";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

type Tab = "overview" | "compare" | "trend" | "report" | "roi" | "funnel" | "competitor" | "alerts";

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

  // Overview: triggered alerts
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [vData, cData, tAlerts] = await Promise.all([
        getVideos(1, 1000),
        getConversionSummary(),
        checkAlerts().catch(() => [] as TriggeredAlert[]),
      ]);
      setVideos(vData.videos);
      setConvSummaries(cData);
      setTriggeredAlerts(tAlerts);
    } catch {
      showToast("データの取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load latest report when tab is first opened
  useEffect(() => {
    if (activeTab === "report" && !reportLoaded) {
      setReportLoaded(true);
      getAnalysisResults("marketing_report").then((results) => {
        if (results.length > 0) setReport(results[0].result as MarketingReportResult);
      }).catch(() => {});
    }
  }, [activeTab, reportLoaded]);

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
    } catch (e: any) {
      showToast(e.message ?? "レポート生成に失敗しました", "error");
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
    } catch (e: any) {
      showToast(e.message ?? "PPTX生成に失敗しました", "error");
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
    } catch (e: any) {
      showToast(e.message ?? "台本提案の生成に失敗しました", "error");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "概要" },
    { key: "compare", label: "動画比較" },
    { key: "trend", label: "推移" },
    { key: "report", label: "レポート" },
    { key: "roi", label: "ROI" },
    { key: "funnel", label: "ファネル" },
    { key: "competitor", label: "競合比較" },
    { key: "alerts", label: "アラート" },
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">マーケティング分析</h2>
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
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
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
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">動画数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{filteredVideos.length}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">CV指標登録</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{filteredConvSummaries.length}本</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">指標種類</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{allMetrics.length}</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">タグ数</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{allTags.length}</p>
            </div>
          </div>

          {/* Triggered alerts warning */}
          {triggeredAlerts.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                  アラート発動中 ({triggeredAlerts.length}件)
                </h3>
              </div>
              <div className="space-y-1">
                {triggeredAlerts.slice(0, 5).map((t, i) => (
                  <p key={`${t.id}-${i}`} className="text-xs text-red-700 dark:text-red-400">
                    {t.video_filename}: {t.metric_name} = {t.current_value}（閾値 {t.condition === "above" ? ">" : "<"} {t.threshold}）
                  </p>
                ))}
                {triggeredAlerts.length > 5 && (
                  <p className="text-xs text-red-500 dark:text-red-400">他 {triggeredAlerts.length - 5}件...</p>
                )}
              </div>
              <button onClick={() => setActiveTab("alerts")} className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
                アラート設定を確認 →
              </button>
            </div>
          )}

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
                          {payload.map((p: any) => (
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
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      sel
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
                            className={`text-right py-2 px-3 tabular-nums ${
                              typeof v.value === "number" && v.value === maxVal
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
                          <span className={`text-sm font-bold tabular-nums ${
                            item.overall_score >= 7 ? "text-green-600" : item.overall_score >= 5 ? "text-yellow-600" : "text-red-600"
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
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                          ip.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
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

      {/* ===== ROI Tab ===== */}
      {activeTab === "roi" && (
        <ROITab convSummaries={filteredConvSummaries} allMetrics={allMetrics} />
      )}

      {/* ===== Funnel Tab ===== */}
      {activeTab === "funnel" && (
        <FunnelTab videos={filteredVideos} convSummaries={filteredConvSummaries} allMetrics={allMetrics} />
      )}

      {/* ===== Competitor Tab ===== */}
      {activeTab === "competitor" && (
        <CompetitorTab convSummaries={filteredConvSummaries} allMetrics={allMetrics} showToast={showToast} />
      )}

      {/* ===== Alerts Tab ===== */}
      {activeTab === "alerts" && (
        <AlertsTab allMetrics={allMetrics} videos={videos} showToast={showToast} />
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
