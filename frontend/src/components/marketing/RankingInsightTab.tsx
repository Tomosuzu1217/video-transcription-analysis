import { useState, useEffect, useCallback } from "react";
import { runRankingPlatformInsight, getAnalysisResults } from "../../api/analysis";
import { getErrorMessage } from "../../utils/errors";
import type { RankingPlatformInsightResult } from "../../types";

interface Props {
  managedTags: string[];
  showToast: (msg: string, type: "success" | "error") => void;
}

const IMPORTANCE_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: "最重要", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  high: { label: "高", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  medium: { label: "中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

export default function RankingInsightTab({ managedTags, showToast }: Props) {
  const [result, setResult] = useState<RankingPlatformInsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load past result
  const loadPastResult = useCallback(async () => {
    try {
      const results = await getAnalysisResults("ranking_platform_insight");
      if (results.length > 0) {
        setResult(results[0].result as RankingPlatformInsightResult);
      }
    } catch { /* ignore */ }
    finally { setInitialLoading(false); }
  }, []);

  useEffect(() => { loadPastResult(); }, [loadPastResult]);

  const handleRun = async () => {
    try {
      setLoading(true);
      const r = await runRankingPlatformInsight(managedTags.length > 0 ? managedTags : undefined);
      setResult(r as RankingPlatformInsightResult);
      showToast("ランキング分析が完了しました", "success");
    } catch (e) {
      showToast(getErrorMessage(e, "分析に失敗しました"), "error");
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Run button */}
      <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-1">ランキング・ペルソナ分析</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          ランキング上位と下位の傾向を比較し、ヒット要因とペルソナの違いを分析します。
        </p>
        <button onClick={handleRun} disabled={loading}
          className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 transition-all">
          {loading ? "分析中..." : "ランキング分析を実行"}
        </button>
        {loading && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-r-transparent" />
            <span className="text-sm text-amber-600 dark:text-amber-400 animate-pulse">Gemini AI が分析中...</span>
          </div>
        )}
      </div>

      {!result && !loading && (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          分析結果がありません。上のボタンから分析を実行してください。
        </p>
      )}

      {result && !loading && (
        <div className="space-y-5">
          {/* Overall Summary */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-5">
            <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">総合サマリー</h4>
            <p className="text-sm text-amber-700 dark:text-amber-200 leading-relaxed">{result.overall_summary}</p>
          </div>

          {/* Platform Ranking Matrix */}
          {result.platform_ranking_matrix.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">媒体別ランキングマトリクス</h4>
              <div className="space-y-4">
                {result.platform_ranking_matrix.map((pm, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h5 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{pm.platform}</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">上位動画</p>
                        {pm.top_videos.length > 0 ? (
                          <div className="space-y-1">
                            {pm.top_videos.map((v, j) => (
                              <div key={j} className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-bold text-green-600 dark:text-green-400 mr-1">#{v.ranking}</span>
                                {v.name}
                                {v.hit_factors.length > 0 && (
                                  <span className="text-gray-400 dark:text-gray-500 ml-1">({v.hit_factors.join(", ")})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-gray-400">なし</p>}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">下位動画</p>
                        {pm.low_videos.length > 0 ? (
                          <div className="space-y-1">
                            {pm.low_videos.map((v, j) => (
                              <div key={j} className="text-xs text-gray-700 dark:text-gray-300">
                                <span className="font-bold text-red-600 dark:text-red-400 mr-1">
                                  {v.ranking != null ? `#${v.ranking}` : "-"}
                                </span>
                                {v.name}
                                {v.weak_points.length > 0 && (
                                  <span className="text-gray-400 dark:text-gray-500 ml-1">({v.weak_points.join(", ")})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-xs text-gray-400">なし</p>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-600">
                      <span className="font-medium">成功パターン:</span> {pm.platform_success_formula}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hit Factor Analysis */}
          {result.hit_factor_analysis.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm overflow-x-auto">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">ヒット要因分析</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">重要度</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">要因</th>
                    <th className="text-left py-2 px-3 font-medium text-green-600 dark:text-green-400">上位動画の特徴</th>
                    <th className="text-left py-2 px-3 font-medium text-red-600 dark:text-red-400">下位動画の課題</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">有効な媒体</th>
                  </tr>
                </thead>
                <tbody>
                  {result.hit_factor_analysis.map((hf, i) => {
                    const imp = IMPORTANCE_LABELS[hf.importance] ?? { label: hf.importance, color: "bg-gray-100 text-gray-700" };
                    return (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-2 px-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${imp.color}`}>{imp.label}</span>
                        </td>
                        <td className="py-2 px-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{hf.factor}</td>
                        <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{hf.top_video_usage}</td>
                        <td className="py-2 px-3 text-xs text-gray-600 dark:text-gray-300">{hf.low_video_gap}</td>
                        <td className="py-2 px-3 text-xs text-gray-500 dark:text-gray-400">{hf.platforms_where_effective.join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Persona Profiles */}
          {result.persona_profiles.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">ペルソナプロファイル</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.persona_profiles.map((pp, i) => (
                  <div key={i} className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4">
                    <h5 className="text-sm font-bold text-purple-800 dark:text-purple-300 mb-2">{pp.platform}</h5>
                    <div className="space-y-1.5 text-xs">
                      <p className="font-medium text-purple-700 dark:text-purple-400">メインペルソナ</p>
                      <p className="text-gray-700 dark:text-gray-300">
                        {pp.primary_persona.age_range} / {pp.primary_persona.gender} / {pp.primary_persona.lifestyle}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400">
                        メディア接触: {pp.primary_persona.media_consumption}
                      </p>
                      {pp.primary_persona.purchase_triggers.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-gray-500 dark:text-gray-400">購買トリガー:</span>
                          {pp.primary_persona.purchase_triggers.map((t, j) => (
                            <span key={j} className="rounded bg-purple-100 dark:bg-purple-800/40 px-1.5 py-0.5 text-purple-700 dark:text-purple-300">{t}</span>
                          ))}
                        </div>
                      )}
                      {pp.primary_persona.content_preferences.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          <span className="text-gray-500 dark:text-gray-400">好みのコンテンツ:</span>
                          {pp.primary_persona.content_preferences.map((c, j) => (
                            <span key={j} className="rounded bg-purple-100 dark:bg-purple-800/40 px-1.5 py-0.5 text-purple-700 dark:text-purple-300">{c}</span>
                          ))}
                        </div>
                      )}
                      {pp.secondary_persona && (
                        <div className="pt-1.5 mt-1.5 border-t border-purple-200 dark:border-purple-700">
                          <p className="font-medium text-purple-600 dark:text-purple-400">サブペルソナ</p>
                          <p className="text-gray-600 dark:text-gray-400">
                            {pp.secondary_persona.age_range} / {pp.secondary_persona.gender} / {pp.secondary_persona.lifestyle}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross Platform Persona Insights */}
          {result.cross_platform_persona_insights.length > 0 && (
            <div className="rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 p-5">
              <h4 className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-3">クロスプラットフォーム示唆</h4>
              <div className="space-y-2">
                {result.cross_platform_persona_insights.map((ci, i) => (
                  <div key={i} className="rounded-lg bg-white dark:bg-gray-800 border border-teal-200 dark:border-teal-700 p-3">
                    <p className="text-sm text-teal-800 dark:text-teal-200">{ci.insight}</p>
                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-medium">アクション: {ci.actionable}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content Strategy by Platform */}
          {result.content_strategy_by_platform.length > 0 && (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">媒体別コンテンツ戦略</h4>
              <div className="space-y-4">
                {result.content_strategy_by_platform.map((cs, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h5 className="text-sm font-bold text-gray-900 dark:text-white mb-2">{cs.platform}</h5>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="font-medium text-gray-500 dark:text-gray-400">推奨尺: </span>
                        <span className="text-gray-700 dark:text-gray-300">{cs.ideal_length}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-500 dark:text-gray-400">フック戦略: </span>
                        <span className="text-gray-700 dark:text-gray-300">{cs.hook_strategy}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-500 dark:text-gray-400">ペルソナ訴求: </span>
                        <span className="text-gray-700 dark:text-gray-300">{cs.persona_messaging}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-500 dark:text-gray-400">CTA: </span>
                        <span className="text-gray-700 dark:text-gray-300">{cs.cta_approach}</span>
                      </div>
                    </div>
                    {cs.sample_script_outline && (
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">台本アウトライン</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line">{cs.sample_script_outline}</p>
                      </div>
                    )}
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
