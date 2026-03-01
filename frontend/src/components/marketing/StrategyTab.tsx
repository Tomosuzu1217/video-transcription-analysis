import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Video, AdPerformance } from "../../types";

interface Props {
    videos: Video[];
    adPerfList: AdPerformance[];
    adPerfMap: Map<string, AdPerformance>;
    managedTags: string[];
    showToast: (msg: string, type: "success" | "error") => void;
}

const MEDIA_COLORS: Record<string, string> = {
    "Meta広告": "#3b82f6",
    "Tik広告": "#1c1c1c",
    "Go広告": "#10b981",
    "SEO": "#f59e0b",
    "ASP": "#f97316",
    "公式Insta": "#ec4899",
};

const METRICS = [
    { key: "spend", label: "消化金額" },
    { key: "line_adds", label: "LINE追加" },
    { key: "answers", label: "回答数" },
    { key: "contracts", label: "成約数" },
    { key: "revenue", label: "売上" },
    { key: "roi", label: "ROI(%)" },
    { key: "score", label: "事業貢献スコア" },
];

function fmt(v: number | null, isPercent = false): string {
    if (v === null || v === undefined) return "—";
    if (isPercent) return `${v.toFixed(1)}%`;
    if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return v.toFixed(1);
}

export default function StrategyTab({ videos, adPerfList, adPerfMap }: Props) {
    const [selectedMetric, setSelectedMetric] = useState("score");

    // 媒体別集計
    const mediaStats = useMemo(() => {
        const map = new Map<string, { count: number; totalScore: number; totalRoi: number; totalSpend: number; totalContracts: number; totalRevenue: number }>();
        for (const ap of adPerfList) {
            const m = ap.media || "不明";
            const cur = map.get(m) ?? { count: 0, totalScore: 0, totalRoi: 0, totalSpend: 0, totalContracts: 0, totalRevenue: 0 };
            map.set(m, {
                count: cur.count + 1,
                totalScore: cur.totalScore + (ap.score ?? 0),
                totalRoi: cur.totalRoi + (ap.roi ?? 0),
                totalSpend: cur.totalSpend + (ap.spend ?? 0),
                totalContracts: cur.totalContracts + (ap.contracts ?? 0),
                totalRevenue: cur.totalRevenue + (ap.revenue ?? 0),
            });
        }
        return Array.from(map.entries()).map(([media, s]) => ({
            media,
            count: s.count,
            avgScore: s.count > 0 ? s.totalScore / s.count : 0,
            avgRoi: s.count > 0 ? s.totalRoi / s.count : 0,
            totalSpend: s.totalSpend,
            totalContracts: s.totalContracts,
            totalRevenue: s.totalRevenue,
            roas: s.totalSpend > 0 ? (s.totalRevenue / s.totalSpend) * 100 : 0,
        })).sort((a, b) => b.avgScore - a.avgScore);
    }, [adPerfList]);

    // 指標別バーチャートデータ
    const metricBarData = useMemo(() => {
        const metric = selectedMetric as keyof AdPerformance;
        const map = new Map<string, number[]>();
        for (const ap of adPerfList) {
            const v = ap[metric];
            if (typeof v === "number") {
                const arr = map.get(ap.media) ?? [];
                arr.push(v);
                map.set(ap.media, arr);
            }
        }
        return Array.from(map.entries()).map(([media, vals]) => ({
            media,
            value: vals.reduce((a, b) => a + b, 0) / vals.length,
        })).sort((a, b) => b.value - a.value);
    }, [adPerfList, selectedMetric]);

    // 上位動画（スコア順）
    const topVideos = useMemo(() => {
        return videos
            .filter((v) => v.code && adPerfMap.has(v.code))
            .map((v) => ({ video: v, ad: adPerfMap.get(v.code!)! }))
            .filter((x) => x.ad.score !== null && x.ad.score > 0)
            .sort((a, b) => (b.ad.score ?? 0) - (a.ad.score ?? 0))
            .slice(0, 10);
    }, [videos, adPerfMap]);

    // 媒体別 成約CPA（消化金額÷成約数）
    const cpaBySummary = useMemo(() => {
        return mediaStats
            .filter((m) => m.totalContracts > 0 && m.totalSpend > 0)
            .map((m) => ({
                media: m.media,
                cpa: m.totalSpend / m.totalContracts,
            }))
            .sort((a, b) => a.cpa - b.cpa);
    }, [mediaStats]);

    if (adPerfList.length === 0) {
        return (
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-12 text-center shadow-sm">
                <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">広告実績データがありません</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">「広告データ」ページからExcelをインポートしてください</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 媒体別サマリーカード */}
            <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">媒体別パフォーマンスサマリー</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {mediaStats.map((m) => (
                        <div
                            key={m.media}
                            className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm"
                            style={{ borderTop: `3px solid ${MEDIA_COLORS[m.media] ?? "#6b7280"}` }}
                        >
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">{m.media}</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{m.count}<span className="text-xs font-normal text-gray-400 ml-1">本</span></p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                スコア avg: <span className="font-semibold text-blue-600 dark:text-blue-400">{m.avgScore.toFixed(1)}</span>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                ROI avg: <span className="font-semibold text-green-600 dark:text-green-400">{m.avgRoi.toFixed(0)}%</span>
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 指標別媒体比較バーチャート */}
            <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">媒体別指標比較（平均値）</h3>
                    <select
                        value={selectedMetric}
                        onChange={(e) => setSelectedMetric(e.target.value)}
                        className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                        {METRICS.map((m) => (
                            <option key={m.key} value={m.key}>{m.label}</option>
                        ))}
                    </select>
                </div>
                {metricBarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={metricBarData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="media" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip
                                formatter={(v: number | undefined) => [fmt(v ?? null, selectedMetric === "roi"), METRICS.find(m => m.key === selectedMetric)?.label]}
                                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {metricBarData.map((entry) => (
                                    <Cell key={entry.media} fill={MEDIA_COLORS[entry.media] ?? "#6b7280"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <p className="text-sm text-gray-400 text-center py-8">データなし</p>
                )}
            </div>

            {/* 成約CPA（媒体別） */}
            {cpaBySummary.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">媒体別 成約CPA（消化金額÷成約数）</h3>
                    <div className="space-y-2">
                        {cpaBySummary.map((row, i) => (
                            <div key={row.media} className="flex items-center gap-3">
                                <span className={`text-xs font-bold w-5 text-right ${i === 0 ? "text-yellow-500" : "text-gray-400"}`}>{i + 1}</span>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 w-24 truncate">{row.media}</span>
                                <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${Math.min((cpaBySummary[cpaBySummary.length - 1].cpa / row.cpa) * 100, 100)}%`,
                                            backgroundColor: MEDIA_COLORS[row.media] ?? "#6b7280",
                                        }}
                                    />
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums w-24 text-right">
                                    ¥{row.cpa.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">※ 棒の長さは低CPA（効率良）が長くなるよう正規化しています</p>
                </div>
            )}

            {/* 上位動画TOP10 */}
            {topVideos.length > 0 && (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">事業貢献スコア TOP10 動画</h3>
                        <p className="text-xs text-gray-400 mt-0.5">次回制作の参考として、これらの動画のナレーション・構成・媒体を研究してください</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-700/50">
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">順位</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">コード</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">媒体</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">スコア</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">ROI</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">成約数</th>
                                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400">売上</th>
                                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">動画ファイル</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {topVideos.map(({ video, ad }, i) => (
                                    <tr key={video.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-gray-100 text-gray-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-400"
                                                }`}>{i + 1}</span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{ad.code}</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                                                style={{ backgroundColor: `${MEDIA_COLORS[ad.media] ?? "#6b7280"}20`, color: MEDIA_COLORS[ad.media] ?? "#6b7280" }}>
                                                {ad.media}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 tabular-nums">{(ad.score ?? 0).toFixed(1)}</td>
                                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{ad.roi !== null ? `${ad.roi.toFixed(0)}%` : "—"}</td>
                                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{ad.contracts !== null ? ad.contracts.toLocaleString() : "—"}</td>
                                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">{ad.revenue !== null ? `¥${ad.revenue.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}` : "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px] truncate" title={video.filename}>{video.filename}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 戦略サマリー（定性的インサイト） */}
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 p-5">
                <h3 className="text-base font-semibold text-blue-900 dark:text-blue-300 mb-3">📊 戦略的インサイト</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    {mediaStats.length > 0 && (
                        <div className="rounded-lg bg-white/60 dark:bg-gray-800/40 p-4">
                            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🏆 最高スコア媒体</p>
                            <p className="text-blue-700 dark:text-blue-300 font-bold text-lg">{mediaStats[0].media}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">平均スコア {mediaStats[0].avgScore.toFixed(1)} / 平均ROI {mediaStats[0].avgRoi.toFixed(0)}%</p>
                        </div>
                    )}
                    {cpaBySummary.length > 0 && (
                        <div className="rounded-lg bg-white/60 dark:bg-gray-800/40 p-4">
                            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">💡 最効率媒体（低CPA）</p>
                            <p className="text-green-700 dark:text-green-300 font-bold text-lg">{cpaBySummary[0].media}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">成約CPA ¥{cpaBySummary[0].cpa.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}</p>
                        </div>
                    )}
                    {topVideos.length > 0 && (
                        <div className="rounded-lg bg-white/60 dark:bg-gray-800/40 p-4">
                            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🎯 最高貢献動画</p>
                            <p className="text-purple-700 dark:text-purple-300 font-bold truncate">{topVideos[0].ad.code}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{topVideos[0].video.filename}</p>
                        </div>
                    )}
                    <div className="rounded-lg bg-white/60 dark:bg-gray-800/40 p-4">
                        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">📈 次のアクション</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            {mediaStats.length > 0 ? `「${mediaStats[0].media}」向けに最適化した動画を優先制作し、` : ""}
                            {cpaBySummary.length > 0 ? `「${cpaBySummary[0].media}」の低CPA実績を横展開する` : "ナレッジタブで成功パターンを確認してください"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
