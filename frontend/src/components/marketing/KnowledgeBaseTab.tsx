import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import type { Video, AdPerformance, DashboardData } from "../../types";

interface Props {
    videos: Video[];
    adPerfMap: Map<string, AdPerformance>;
    adPerfList: AdPerformance[];
    dashboard: DashboardData | null;
}

const MEDIA_COLORS: Record<string, string> = {
    "Meta広告": "#3b82f6",
    "Tik広告": "#1c1c1c",
    "Go広告": "#10b981",
    "SEO": "#f59e0b",
    "ASP": "#f97316",
    "公式Insta": "#ec4899",
};

function ScoreBadge({ score }: { score: number | null }) {
    if (score === null) return <span className="text-xs text-gray-400">—</span>;
    const color = score >= 200 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
        : score >= 100 ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400";
    return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${color}`}>{score.toFixed(1)}</span>;
}

export default function KnowledgeBaseTab({ videos, adPerfMap, adPerfList, dashboard }: Props) {
    const [searchQuery, setSearchQuery] = useState("");
    const [mediaFilter, setMediaFilter] = useState("all");
    const [scoreFilter, setScoreFilter] = useState("all");
    const [sortKey, setSortKey] = useState<"score" | "roi" | "contracts" | "recent">("score");

    // 全媒体リスト
    const allMedia = useMemo(() => {
        const set = new Set<string>();
        for (const ap of adPerfList) if (ap.media) set.add(ap.media);
        return Array.from(set).sort();
    }, [adPerfList]);

    // トップキーワードマップ（動画ファイル名 → キーワード）
    const topKeywordsByVideo = useMemo(() => {
        const map = new Map<string, string[]>();
        (dashboard?.top_keywords ?? []).forEach((kw) => {
            Object.entries(kw.video_counts ?? {}).forEach(([vname]) => {
                const arr = map.get(vname) ?? [];
                arr.push(kw.keyword);
                map.set(vname, arr);
            });
        });
        return map;
    }, [dashboard]);

    // フィルタ・ソート済み動画リスト
    const filteredAndSorted = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        let list = videos
            .filter((v) => v.code && adPerfMap.has(v.code))
            .map((v) => ({ video: v, ad: adPerfMap.get(v.code!)! }));

        // フィルタ
        if (mediaFilter !== "all") list = list.filter((x) => x.ad.media === mediaFilter);
        if (scoreFilter === "high") list = list.filter((x) => (x.ad.score ?? 0) >= 200);
        else if (scoreFilter === "mid") list = list.filter((x) => (x.ad.score ?? 0) >= 100 && (x.ad.score ?? 0) < 200);
        else if (scoreFilter === "low") list = list.filter((x) => (x.ad.score ?? 0) < 100);
        if (query) list = list.filter((x) => x.video.filename.toLowerCase().includes(query) || x.ad.code.toLowerCase().includes(query));

        // ソート
        list.sort((a, b) => {
            if (sortKey === "score") return (b.ad.score ?? 0) - (a.ad.score ?? 0);
            if (sortKey === "roi") return (b.ad.roi ?? -Infinity) - (a.ad.roi ?? -Infinity);
            if (sortKey === "contracts") return (b.ad.contracts ?? 0) - (a.ad.contracts ?? 0);
            return new Date(b.video.created_at).getTime() - new Date(a.video.created_at).getTime();
        });

        return list;
    }, [videos, adPerfMap, mediaFilter, scoreFilter, searchQuery, sortKey]);

    // 書き起こし済みかどうか
    const isTranscribed = (v: Video) => v.status === "transcribed";

    const totalLinked = videos.filter((v) => v.code && adPerfMap.has(v.code)).length;

    return (
        <div className="space-y-5">
            {/* ヘッダー統計 */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-4 py-2">
                    <span className="text-xs text-blue-600 dark:text-blue-400">紐付け済み動画</span>
                    <span className="ml-2 text-lg font-bold text-blue-700 dark:text-blue-300">{totalLinked}</span>
                    <span className="text-xs text-blue-500 dark:text-blue-400 ml-1">/ {videos.length}本</span>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2">
                    <span className="text-xs text-green-600 dark:text-green-400">書き起こし済み</span>
                    <span className="ml-2 text-lg font-bold text-green-700 dark:text-green-300">
                        {filteredAndSorted.filter((x) => isTranscribed(x.video)).length}
                    </span>
                    <span className="text-xs text-green-500 dark:text-green-400 ml-1">本</span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                    ※ 動画の「コード」とExcel実績データを紐付けると詳細が表示されます
                </p>
            </div>

            {/* フィルター・ソート */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="動画名・コードで検索"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-4 py-2 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                </div>
                <select
                    value={mediaFilter}
                    onChange={(e) => setMediaFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                    <option value="all">全媒体</option>
                    {allMedia.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select
                    value={scoreFilter}
                    onChange={(e) => setScoreFilter(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                    <option value="all">全スコア</option>
                    <option value="high">高スコア（200+）</option>
                    <option value="mid">中スコア（100〜199）</option>
                    <option value="low">低スコア（〜99）</option>
                </select>
                <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                    <option value="score">スコア順</option>
                    <option value="roi">ROI順</option>
                    <option value="contracts">成約数順</option>
                    <option value="recent">登録日順</option>
                </select>
                <span className="text-xs text-gray-400">{filteredAndSorted.length}件</span>
            </div>

            {/* ナレッジカード一覧 */}
            {filteredAndSorted.length === 0 ? (
                <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-12 text-center shadow-sm">
                    {adPerfList.length === 0 ? (
                        <>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">広告実績データがありません</p>
                            <p className="text-xs text-gray-400 mt-1">「広告データ」ページからExcelをインポートし、動画にコードを設定してください</p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500">条件に一致する動画が見つかりません</p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredAndSorted.map(({ video, ad }) => {
                        const keywords = topKeywordsByVideo.get(video.filename) ?? [];
                        const transcribed = isTranscribed(video);
                        return (
                            <Link
                                key={video.id}
                                to={`/videos/${video.id}`}
                                className="block rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                            >
                                {/* カードヘッダー */}
                                <div className="px-4 pt-4 pb-3 border-b border-gray-50 dark:border-gray-700">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate" title={video.filename}>
                                                {video.filename}
                                            </p>
                                            <p className="text-xs font-mono text-gray-400 mt-0.5">{ad.code}</p>
                                        </div>
                                        <ScoreBadge score={ad.score} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span
                                            className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                                            style={{ backgroundColor: `${MEDIA_COLORS[ad.media] ?? "#6b7280"}20`, color: MEDIA_COLORS[ad.media] ?? "#6b7280" }}
                                        >
                                            {ad.media}
                                        </span>
                                        {transcribed ? (
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 text-xs text-green-700 dark:text-green-300">
                                                <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
                                                書き起こし済
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                                                未書き起こし
                                            </span>
                                        )}
                                        {(video.tags ?? []).slice(0, 2).map((t) => (
                                            <span key={t} className="rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-1.5 py-0.5 text-xs text-blue-600 dark:text-blue-400">{t}</span>
                                        ))}
                                    </div>
                                </div>

                                {/* 指標グリッド */}
                                <div className="grid grid-cols-3 gap-0 divide-x divide-gray-100 dark:divide-gray-700">
                                    <div className="px-3 py-2 text-center">
                                        <p className="text-xs text-gray-400">ROI</p>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">{ad.roi !== null ? `${ad.roi.toFixed(0)}%` : "—"}</p>
                                    </div>
                                    <div className="px-3 py-2 text-center">
                                        <p className="text-xs text-gray-400">成約数</p>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">{ad.contracts !== null ? ad.contracts.toLocaleString() : "—"}</p>
                                    </div>
                                    <div className="px-3 py-2 text-center">
                                        <p className="text-xs text-gray-400">消化金額</p>
                                        <p className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                                            {ad.spend !== null ? `¥${(ad.spend / 1000).toFixed(0)}K` : "—"}
                                        </p>
                                    </div>
                                </div>

                                {/* キーワード */}
                                {keywords.length > 0 && (
                                    <div className="px-4 py-2.5 border-t border-gray-50 dark:border-gray-700">
                                        <p className="text-xs text-gray-400 mb-1">主要キーワード</p>
                                        <div className="flex flex-wrap gap-1">
                                            {keywords.slice(0, 5).map((kw) => (
                                                <span key={kw} className="rounded bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 text-xs text-indigo-600 dark:text-indigo-400">{kw}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
