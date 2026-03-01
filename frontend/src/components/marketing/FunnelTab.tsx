import { useState, useMemo } from "react";
import type { ConversionSummary, Video, AdPerformance } from "../../types";

const AD_FUNNEL_STAGES = ["LINE追加", "回答数", "顧客数", "成約数", "売上"];

interface Props {
  videos: Video[];
  convSummaries: ConversionSummary[];
  allMetrics: string[];
  adPerfMap?: Map<string, AdPerformance>;
}

export default function FunnelTab({ videos, convSummaries, allMetrics, adPerfMap }: Props) {
  const [stages, setStages] = useState<string[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<number | "all">("all");
  const [adFunnelOverride, setAdFunnelOverride] = useState<Array<{ name: string; value: number; rate: number | null }> | null>(null);

  const selectedVideoAd = useMemo(() => {
    if (selectedVideoId === "all" || !adPerfMap) return null;
    const video = videos.find((v) => v.id === selectedVideoId);
    if (!video?.code) return null;
    return adPerfMap.get(video.code) ?? null;
  }, [selectedVideoId, adPerfMap, videos]);

  const handleAutoFunnel = (ad: AdPerformance) => {
    const vals: Record<string, number> = {
      "LINE追加": ad.line_adds ?? 0,
      "回答数": ad.answers ?? 0,
      "顧客数": ad.customers ?? 0,
      "成約数": ad.contracts ?? 0,
      "売上": ad.revenue ?? 0,
    };
    const funnel = AD_FUNNEL_STAGES.map((name, i) => ({
      name,
      value: vals[name],
      rate: i > 0 && vals[AD_FUNNEL_STAGES[i - 1]] > 0
        ? Math.round((vals[name] / vals[AD_FUNNEL_STAGES[i - 1]]) * 10000) / 100
        : null,
    }));
    setStages(AD_FUNNEL_STAGES);
    setAdFunnelOverride(funnel);
  };

  const addStage = (metric: string) => {
    if (!metric || stages.includes(metric)) return;
    setStages([...stages, metric]);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const moveStage = (index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= stages.length) return;
    const copy = [...stages];
    [copy[index], copy[newIdx]] = [copy[newIdx], copy[index]];
    setStages(copy);
  };

  const funnelData = useMemo(() => {
    if (stages.length === 0) return [];

    if (selectedVideoId === "all") {
      // Aggregate across all videos
      return stages.map((name, i) => {
        const total = convSummaries.reduce((sum, s) => sum + (s.metrics[name] ?? 0), 0);
        const prev = i > 0 ? convSummaries.reduce((sum, s) => sum + (s.metrics[stages[i - 1]] ?? 0), 0) : null;
        return {
          name,
          value: total,
          rate: prev && prev > 0 ? Math.round((total / prev) * 10000) / 100 : null,
        };
      });
    } else {
      const summary = convSummaries.find((s) => s.video_id === selectedVideoId);
      if (!summary) return [];
      return stages.map((name, i) => {
        const value = summary.metrics[name] ?? 0;
        const prev = i > 0 ? (summary.metrics[stages[i - 1]] ?? 0) : null;
        return {
          name,
          value,
          rate: prev && prev > 0 ? Math.round((value / prev) * 10000) / 100 : null,
        };
      });
    }
  }, [stages, selectedVideoId, convSummaries]);

  const displayData = adFunnelOverride ?? funnelData;
  const maxValue = Math.max(...displayData.map((d) => d.value), 1);

  return (
    <div className="space-y-6">
      {/* Stage builder */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">ファネル構築</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">指標を順番に追加してファネルを作成します。表示対象は全体集計か動画単位で切り替えできます。</p>

        {/* Ad funnel auto-fill button */}
        {selectedVideoAd && (
          <div className="mb-3 flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex-1 text-xs text-blue-700 dark:text-blue-300">
              広告実績データあり（LINE追加→回答数→顧客数→成約数→売上）
            </div>
            {adFunnelOverride ? (
              <button
                onClick={() => { setAdFunnelOverride(null); }}
                className="text-xs px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                手動設定に戻す
              </button>
            ) : (
              <button
                onClick={() => handleAutoFunnel(selectedVideoAd)}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                広告ファネルを自動設定
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <select id="funnel-add" defaultValue=""
            onChange={(e) => { addStage(e.target.value); e.target.value = ""; }}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">指標を追加...</option>
            {allMetrics.filter((m) => !stages.includes(m)).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedVideoId} onChange={(e) => setSelectedVideoId(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="all">全動画集計</option>
            {videos.filter((v) => convSummaries.some((s) => s.video_id === v.id)).map((v) => (
              <option key={v.id} value={v.id}>{v.filename}</option>
            ))}
          </select>
        </div>

        {/* Stage chips */}
        {stages.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {stages.map((s, i) => (
              <div key={s} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-3 py-1">
                {i > 0 && (
                  <button onClick={() => moveStage(i, -1)} className="text-blue-500 hover:text-blue-700 text-xs">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">{i + 1}. {s}</span>
                {i < stages.length - 1 && (
                  <button onClick={() => moveStage(i, 1)} className="text-blue-500 hover:text-blue-700 text-xs">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
                <button onClick={() => removeStage(i)} className="text-blue-400 hover:text-red-500 ml-1">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Funnel visualization */}
      {displayData.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            ファネルチャート
            {adFunnelOverride && (
              <span className="ml-2 text-xs font-normal text-blue-500 dark:text-blue-400">（広告実績データ）</span>
            )}
          </h3>
          <div className="space-y-1">
            {displayData.map((d, i) => {
              const widthPercent = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
              const colors = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#c084fc", "#d8b4fe"];
              const color = colors[i % colors.length];
              return (
                <div key={d.name}>
                  {d.rate !== null && (
                    <div className="flex items-center justify-center py-1">
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                        CV率 {d.rate}%
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-28 text-right shrink-0">{d.name}</span>
                    <div className="flex-1 flex items-center justify-center">
                      <div
                        className="h-10 rounded-lg flex items-center justify-center transition-all duration-500"
                        style={{
                          width: `${Math.max(widthPercent, 5)}%`,
                          background: color,
                        }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow">{d.value.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall conversion rate */}
          {displayData.length >= 2 && displayData[0].value > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 text-center">
              <span className="text-sm text-gray-500 dark:text-gray-400">全体コンバージョン率 </span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {Math.round((displayData[displayData.length - 1].value / displayData[0].value) * 10000) / 100}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
