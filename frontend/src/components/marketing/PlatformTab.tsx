import { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { updateVideoTags } from "../../api/videos";
import { runPlatformAnalysis, getAnalysisResults } from "../../api/analysis";
import type { Video, ConversionSummary, CrossPlatformAnalysisResult } from "../../types";

const KNOWN_COLORS: Record<string, string> = {
  YouTube: "#FF0000",
  TikTok: "#000000",
  Instagram: "#E1306C",
  Facebook: "#1877F2",
  LINE: "#06C755",
  "X(Twitter)": "#1DA1F2",
};

const FALLBACK_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4", "#84cc16", "#f43f5e"];

function getPlatformColor(tag: string, index: number): string {
  return KNOWN_COLORS[tag] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface Props {
  videos: Video[];
  convSummaries: ConversionSummary[];
  allMetrics: string[];
  managedTags: string[];
  showToast: (msg: string, type: "success" | "error") => void;
  onVideoUpdate?: () => void;
}

export default function PlatformTab({ videos, convSummaries, allMetrics, managedTags, showToast, onVideoUpdate }: Props) {
  const [analysisResult, setAnalysisResult] = useState<CrossPlatformAnalysisResult | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [resultLoaded, setResultLoaded] = useState(false);

  // Load latest analysis on mount
  useEffect(() => {
    if (!resultLoaded) {
      setResultLoaded(true);
      getAnalysisResults("platform_analysis").then((results) => {
        if (results.length > 0) setAnalysisResult(results[0].result as CrossPlatformAnalysisResult);
      }).catch(() => {});
    }
  }, [resultLoaded]);

  // Group videos by platform
  const platformData = useMemo(() => {
    const groups = new Map<string, { videos: Video[]; summaries: ConversionSummary[] }>();
    for (const p of managedTags) groups.set(p, { videos: [], summaries: [] });

    for (const v of videos) {
      for (const tag of v.tags ?? []) {
        if (groups.has(tag)) {
          groups.get(tag)!.videos.push(v);
          const summary = convSummaries.find((s) => s.video_id === v.id);
          if (summary) groups.get(tag)!.summaries.push(summary);
        }
      }
    }
    return groups;
  }, [videos, convSummaries, managedTags]);

  // Bar chart data: per-platform avg metrics
  const barData = useMemo(() => {
    if (allMetrics.length === 0) return [];
    return allMetrics.slice(0, 5).map((metric) => {
      const row: Record<string, string | number> = { metric };
      for (const [platform, data] of platformData) {
        if (data.summaries.length === 0) continue;
        const sum = data.summaries.reduce((acc, s) => acc + (s.metrics[metric] ?? 0), 0);
        row[platform] = Math.round((sum / data.summaries.length) * 100) / 100;
      }
      return row;
    });
  }, [platformData, allMetrics]);

  const activePlatforms = useMemo(() =>
    Array.from(platformData.entries()).filter(([, d]) => d.summaries.length > 0).map(([p]) => p),
    [platformData],
  );

  const handleTogglePlatformTag = useCallback(async (video: Video, platform: string) => {
    const tags = video.tags ?? [];
    const newTags = tags.includes(platform)
      ? tags.filter((t) => t !== platform)
      : [...tags, platform];
    try {
      await updateVideoTags(video.id, newTags);
      onVideoUpdate?.();
      showToast(`${platform} タグを${newTags.includes(platform) ? "追加" : "削除"}しました`, "success");
    } catch {
      showToast("タグの更新に失敗しました", "error");
    }
  }, [onVideoUpdate, showToast]);

  const handleRunAnalysis = async () => {
    try {
      setLoadingAnalysis(true);
      const result = await runPlatformAnalysis(managedTags);
      setAnalysisResult(result);
      showToast("媒体分析が完了しました", "success");
    } catch (e: any) {
      showToast(e.message ?? "媒体分析に失敗しました", "error");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform tagging section */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">動画に媒体タグを設定</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">各動画がどの広告媒体で配信されるかをタグ付けしてください</p>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {videos.filter((v) => v.status === "transcribed" || v.status === "archived").map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate min-w-0 flex-1" title={v.filename}>
                {v.filename}
              </span>
              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                {managedTags.map((p, idx) => {
                  const active = (v.tags ?? []).includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => handleTogglePlatformTag(v, p)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        active
                          ? "text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                      style={active ? { backgroundColor: getPlatformColor(p, idx) } : undefined}
                      title={p}
                    >
                      {p.replace("(Twitter)", "")}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {videos.filter((v) => v.status === "transcribed" || v.status === "archived").length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">書き起こし済みの動画がありません</p>
          )}
        </div>
      </div>

      {/* Platform overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {managedTags.map((p, idx) => {
          const data = platformData.get(p);
          return (
            <div key={p} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 shadow-sm text-center">
              <div
                className="inline-block rounded-full px-2.5 py-0.5 text-xs font-bold text-white mb-2"
                style={{ backgroundColor: getPlatformColor(p, idx) }}
              >
                {p.replace("(Twitter)", "")}
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{data?.videos.length ?? 0}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">動画</p>
            </div>
          );
        })}
      </div>

      {/* Cross-platform comparison chart */}
      {barData.length > 0 && activePlatforms.length >= 2 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">媒体別 平均指標比較</h3>
          <ResponsiveContainer width="100%" height={Math.max(250, barData.length * 50 + 60)}>
            <BarChart data={barData} layout="vertical" margin={{ left: 100, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="metric" type="category" width={95} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {activePlatforms.map((p) => (
                <Bar key={p} dataKey={p} fill={getPlatformColor(p, managedTags.indexOf(p))} radius={[0, 4, 4, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI Analysis section */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI 媒体分析</h3>
          <button
            onClick={handleRunAnalysis}
            disabled={loadingAnalysis}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all"
          >
            {loadingAnalysis ? "分析中..." : "媒体分析を実行"}
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Gemini AIが各媒体の特性を考慮して、どのような動画・文章・ストーリーが効果的かを分析します。
        </p>
        {loadingAnalysis && (
          <div className="flex items-center gap-2 mt-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
            <span className="text-sm text-blue-600 dark:text-blue-400 animate-pulse">各媒体のコンテンツ戦略を分析中...</span>
          </div>
        )}
      </div>

      {/* Analysis results */}
      {analysisResult && !loadingAnalysis && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-5">
            <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">分析サマリー</h4>
            <p className="text-sm text-blue-700 dark:text-blue-200 leading-relaxed">{analysisResult.summary}</p>
          </div>

          {/* Per-platform analysis */}
          {analysisResult.platform_analyses?.map((pa) => (
            <div key={pa.platform} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span
                  className="rounded-full px-3 py-1 text-sm font-bold text-white"
                  style={{ backgroundColor: getPlatformColor(pa.platform, managedTags.indexOf(pa.platform)) }}
                >
                  {pa.platform}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">({pa.video_count}本)</span>
              </div>

              {pa.best_video && (
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2 mb-4">
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">ベスト動画: </span>
                  <span className="text-xs text-green-800 dark:text-green-300 font-bold">{pa.best_video.name}</span>
                  <span className="text-xs text-green-600 dark:text-green-400"> - {pa.best_video.reason}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">コンテンツ特性</p>
                  <div className="space-y-1.5 text-sm">
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">最適尺: </span><span className="text-gray-600 dark:text-gray-400">{pa.content_characteristics.optimal_duration}</span></p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">ストーリー構成: </span><span className="text-gray-600 dark:text-gray-400">{pa.content_characteristics.storytelling_pattern}</span></p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">トーン: </span><span className="text-gray-600 dark:text-gray-400">{pa.content_characteristics.tone_and_style}</span></p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">CTA戦略: </span><span className="text-gray-600 dark:text-gray-400">{pa.content_characteristics.cta_strategy}</span></p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">効果的なフック</p>
                  <div className="flex flex-wrap gap-1">
                    {pa.content_characteristics.effective_hooks?.map((h, i) => (
                      <span key={i} className="rounded bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs text-purple-700 dark:text-purple-300">{h}</span>
                    ))}
                  </div>
                </div>
              </div>

              {pa.platform_specific_insights?.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">媒体固有の知見</p>
                  <ul className="space-y-1">
                    {pa.platform_specific_insights.map((ins, i) => (
                      <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                        <span className="text-blue-500 mt-0.5 shrink-0">-</span>
                        {ins}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pa.recommendations?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">改善提案</p>
                  <div className="space-y-1.5">
                    {pa.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          r.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : r.priority === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        }`}>
                          {r.priority === "high" ? "高" : r.priority === "medium" ? "中" : "低"}
                        </span>
                        <div className="min-w-0">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{r.area}: </span>
                          <span className="text-xs text-gray-600 dark:text-gray-400">{r.suggestion}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Cross-platform insights */}
          {analysisResult.cross_platform_insights?.length > 0 && (
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 p-5">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">クロスプラットフォーム分析</h4>
              <div className="space-y-2">
                {analysisResult.cross_platform_insights.map((ci, i) => (
                  <div key={i} className="rounded-lg bg-white/60 dark:bg-gray-800/40 p-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ci.insight}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">アクション: {ci.actionable}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content repurposing suggestions */}
          {analysisResult.content_repurposing_suggestions?.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">コンテンツ転用提案</h4>
              <div className="space-y-2">
                {analysisResult.content_repurposing_suggestions.map((cr, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: getPlatformColor(cr.from_platform, managedTags.indexOf(cr.from_platform)) }}
                    >
                      {cr.from_platform}
                    </span>
                    <svg className="h-4 w-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-bold text-white shrink-0"
                      style={{ backgroundColor: getPlatformColor(cr.to_platform, managedTags.indexOf(cr.to_platform)) }}
                    >
                      {cr.to_platform}
                    </span>
                    <p className="text-xs text-gray-600 dark:text-gray-400 min-w-0">{cr.adaptation_needed}</p>
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
