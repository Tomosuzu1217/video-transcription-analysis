import { useCallback, useEffect, useRef, useState } from "react";
import { getAnalysisResults, runMarketingReactionCategoryAnalysis } from "../../api/analysis";
import { getErrorMessage } from "../../utils/errors";
import type { MarketingReactionCategoryResult } from "../../types";

function Spinner() {
  return <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />;
}

function formatMetric(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}${suffix}`;
}

function formatStage(stage: MarketingReactionCategoryResult["videos"][number]["reaction_stage"]): string {
  switch (stage) {
    case "awareness":
      return "認知";
    case "consideration":
      return "比較検討";
    case "decision":
      return "意思決定";
  }
}

function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const hasMarketingReactionResult = (value: unknown): value is MarketingReactionCategoryResult =>
  value !== null && typeof value === "object" && "category_overview" in value && "videos" in value;

export default function MarketingReactionTab() {
  const [result, setResult] = useState<MarketingReactionCategoryResult | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningElapsed, setRunningElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const loadExisting = useCallback(async () => {
    try {
      setLoading(true);
      const analyses = await getAnalysisResults("marketing_reaction_category");
      if (analyses[0] && hasMarketingReactionResult(analyses[0].result)) {
        setResult(analyses[0].result);
        setTimestamp(analyses[0].created_at);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const handleRun = async () => {
    try {
      setRunning(true);
      setError(null);
      setRunningElapsed(0);
      timerRef.current = setInterval(() => setRunningElapsed((value) => value + 1), 1000);
      const next = await runMarketingReactionCategoryAnalysis();
      setResult(next);
      setTimestamp(new Date().toISOString());
    } catch (cause) {
      setError(getErrorMessage(cause, "反応カテゴリ分析の実行に失敗しました。"));
    } finally {
      setRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-emerald-900">マーケティング反応カテゴリ分析</h4>
            <p className="mt-2 text-xs text-emerald-800">
              広告文言から、ユーザーが反応しやすい訴求カテゴリを推定して動画ごとに整理します。
            </p>
            {timestamp && <p className="mt-2 text-xs text-emerald-700">最新実行: {new Date(timestamp).toLocaleString("ja-JP")}</p>}
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {running ? <><Spinner />分析中... ({runningElapsed}s)</> : "分析を実行"}
          </button>
        </div>
      </section>

      {!result ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          まだ反応カテゴリ分析の結果がありません。
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-gray-900">全体要約</h4>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                対象動画 {result.analyzed_video_count} 本
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-gray-700">{result.summary}</p>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 className="text-base font-semibold text-gray-900">カテゴリ別サマリー</h4>
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {result.category_overview.map((category) => (
                <article key={category.category_id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-semibold text-gray-900">{category.label}</h5>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-500">
                          {formatStage(category.stage)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-6 text-gray-600">{category.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">平均スコア</p>
                      <p className="text-lg font-bold text-emerald-700">{formatMetric(category.avg_category_score)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div className="rounded-lg bg-white px-3 py-2">
                      動画数: <span className="font-semibold text-gray-900">{category.matched_video_count}</span>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      ヒット数: <span className="font-semibold text-gray-900">{category.total_marker_hits}</span>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      平均広告スコア: <span className="font-semibold text-gray-900">{formatMetric(category.avg_ad_score)}</span>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-2">
                      平均ROI: <span className="font-semibold text-gray-900">{formatMetric(category.avg_roi, "%")}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-emerald-800">{category.reaction_hypothesis}</p>
                  {category.strongest_markers.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {category.strongest_markers.map((marker) => (
                        <span key={`${category.category_id}-${marker}`} className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                          {marker}
                        </span>
                      ))}
                    </div>
                  )}
                  {category.top_videos.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {category.top_videos.map((video) => (
                        <div key={`${category.category_id}-${video.video_name}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                          <span className="truncate text-gray-700">{video.video_name}</span>
                          <span className="shrink-0 font-semibold text-gray-900">
                            {video.score} / 広告 {formatMetric(video.ad_score)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h4 className="text-base font-semibold text-gray-900">動画別カテゴリ</h4>
            <div className="mt-4 space-y-4">
              {result.videos.map((video) => (
                <article key={video.video_id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-semibold text-gray-900">{video.video_name}</h5>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                          {formatStage(video.reaction_stage)}
                        </span>
                        {video.media && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{video.media}</span>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        広告スコア {formatMetric(video.ad_score)} / ROI {formatMetric(video.roi, "%")} / 成約 {formatMetric(video.contracts)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {video.top_categories.map((category) => (
                        <span key={`${video.video_id}-${category.category_id}`} className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] text-emerald-800">
                          {category.label} {category.score}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
                    {video.top_categories.map((category) => (
                      <div key={`${video.video_id}-${category.category_id}-detail`} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-gray-900">{category.label}</p>
                          <span className="text-xs font-bold text-emerald-700">{category.score}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-gray-600">{category.reaction_hypothesis}</p>
                        {category.evidence.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {category.evidence.slice(0, 2).map((evidence, index) => (
                              <div key={`${video.video_id}-${category.category_id}-${index}`} className="rounded-md bg-white px-2 py-2">
                                <p className="text-[11px] text-gray-500">
                                  {formatTime(evidence.start_time)} - {formatTime(evidence.end_time)}
                                </p>
                                <p className="mt-1 text-[11px] leading-5 text-gray-700">{evidence.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
