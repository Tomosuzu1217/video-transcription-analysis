import { useState, useEffect, useCallback, useRef } from "react";
import {
  runAiRecommendations,
  runRankingComparisonAnalysis,
  runPsychologicalContentAnalysis,
  getAnalysisResults,
} from "../../api/analysis";
import { searchTranscriptions, type SearchResult } from "../../api/transcriptions";
import type { AiAnalysisResult, RankingComparisonResult, PsychologicalContentResult } from "../../types";

// ─── Collapsible section wrapper ─────────────────────────────
function Section({ title, icon, defaultOpen, children, timestamp }: {
  title: string; icon: string; defaultOpen?: boolean;
  children: React.ReactNode; timestamp?: string | null;
}) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const formatTs = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
      + " " + d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  };
  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h4 className="text-base font-semibold text-gray-900">{title}</h4>
        </div>
        <div className="flex items-center gap-3">
          {timestamp && <span className="text-xs text-gray-400">最終実行: {formatTs(timestamp)}</span>}
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="px-6 pb-6 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Helper badges ───────────────────────────────────────────
const getConfidenceBadge = (c: string) => {
  switch (c.toLowerCase()) {
    case "high": return "bg-green-100 text-green-800 border border-green-200";
    case "medium": return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "low": return "bg-red-100 text-red-800 border border-red-200";
    default: return "bg-gray-100 text-gray-800 border border-gray-200";
  }
};
const getConfidenceLabel = (c: string) => {
  switch (c.toLowerCase()) { case "high": return "高"; case "medium": return "中"; case "low": return "低"; default: return c; }
};
const getPriorityBadge = (p: string) => {
  switch (p.toLowerCase()) {
    case "high": return "bg-red-100 text-red-800 border border-red-200";
    case "medium": return "bg-yellow-100 text-yellow-800 border border-yellow-200";
    case "low": return "bg-green-100 text-green-800 border border-green-200";
    default: return "bg-gray-100 text-gray-800 border border-gray-200";
  }
};
const getPriorityLabel = (p: string) => {
  switch (p.toLowerCase()) { case "high": return "高"; case "medium": return "中"; case "low": return "低"; default: return p; }
};

const Spinner = () => (
  <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
);

export default function IntegratedAITab() {
  // ─── State ─────────────────────────────────────────────────
  const [customPrompt, setCustomPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [runningElapsed, setRunningElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI recommendation
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  // Ranking comparison
  const [rankingResult, setRankingResult] = useState<RankingComparisonResult | null>(null);
  const [rankingTimestamp, setRankingTimestamp] = useState<string | null>(null);
  const [rankingLoading, setRankingLoading] = useState(true);

  // Psychological content
  const [psychResult, setPsychResult] = useState<PsychologicalContentResult | null>(null);
  const [psychTimestamp, setPsychTimestamp] = useState<string | null>(null);
  const [psychLoading, setPsychLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ─── Cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, []);

  // ─── Load existing results ────────────────────────────────
  const loadExisting = useCallback(async () => {
    try {
      const [aiData, rankData, psychData] = await Promise.all([
        getAnalysisResults("ai_recommendation"),
        getAnalysisResults("ranking_comparison"),
        getAnalysisResults("psychological_content"),
      ]);
      if (aiData.length > 0) {
        const r = aiData[0].result;
        if (r && typeof r === "object" && "summary" in r) {
          setAiResult({
            summary: r.summary ?? "", effective_keywords: r.effective_keywords ?? [],
            effective_phrases: r.effective_phrases ?? [], correlation_insights: r.correlation_insights ?? [],
            recommendations: r.recommendations ?? [], funnel_suggestions: r.funnel_suggestions ?? [],
          });
        }
        setAiTimestamp(aiData[0].created_at);
      }
      if (rankData.length > 0) {
        const r = rankData[0].result;
        if (r && typeof r === "object" && "summary" in r) {
          setRankingResult({
            summary: r.summary ?? "", psychological_analysis: r.psychological_analysis ?? [],
            storytelling_analysis: r.storytelling_analysis ?? [], linguistic_analysis: r.linguistic_analysis ?? [],
            key_differences: r.key_differences ?? [], recommendations: r.recommendations ?? [],
          });
        }
        setRankingTimestamp(rankData[0].created_at);
      }
      if (psychData.length > 0) {
        const r = psychData[0].result;
        if (r && typeof r === "object" && "overall_summary" in r) {
          setPsychResult(r as unknown as PsychologicalContentResult);
        }
        setPsychTimestamp(psychData[0].created_at);
      }
    } catch {
      /* silent */
    } finally {
      setAiLoading(false);
      setRankingLoading(false);
      setPsychLoading(false);
    }
  }, []);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  // ─── Run all analyses in parallel ─────────────────────────
  const handleRunAll = async () => {
    if (!window.confirm("Gemini APIを使用して3つの分析（AI推奨・ランキング比較・コンテンツ心理分析）を並列実行します。APIの使用量が消費されますが、よろしいですか?")) return;
    try {
      setRunning(true);
      setError(null);
      setRunningElapsed(0);
      elapsedRef.current = setInterval(() => setRunningElapsed((e) => e + 1), 1000);

      const prompt = customPrompt.trim() || undefined;
      const results = await Promise.allSettled([
        runAiRecommendations(prompt),
        runRankingComparisonAnalysis(prompt),
        runPsychologicalContentAnalysis(prompt),
      ]);

      const errors: string[] = [];
      if (results[0].status === "fulfilled") {
        const r = results[0].value;
        setAiResult(r); setAiTimestamp(new Date().toISOString());
      } else { errors.push("AI推奨: " + (results[0].reason?.message ?? "失敗")); }
      if (results[1].status === "fulfilled") {
        const r = results[1].value;
        setRankingResult(r); setRankingTimestamp(new Date().toISOString());
      } else { errors.push("ランキング比較: " + (results[1].reason?.message ?? "失敗")); }
      if (results[2].status === "fulfilled") {
        const r = results[2].value;
        setPsychResult(r); setPsychTimestamp(new Date().toISOString());
      } else { errors.push("心理分析: " + (results[2].reason?.message ?? "失敗")); }

      if (errors.length > 0) setError(errors.join("\n"));
    } catch (err: any) {
      setError(err.message ?? "分析の実行に失敗しました。");
    } finally {
      setRunning(false);
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    }
  };

  // ─── Search handler ────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      setSearchLoading(true);
      setError(null);
      const data = await searchTranscriptions(searchQuery.trim());
      setSearchResults(data.results);
      setSearchTotal(data.total);
    } catch {
      setError("検索に失敗しました。");
    } finally {
      setSearchLoading(false);
    }
  };

  const isLoading = aiLoading || rankingLoading || psychLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          <p className="mt-3 text-gray-500">分析データを読み込み中...</p>
        </div>
      </div>
    );
  }

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
          {error}
        </div>
      )}

      {/* Custom prompt + Run button */}
      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 p-6">
        <h4 className="mb-3 text-sm font-semibold text-blue-900">AI総合分析</h4>
        <p className="mb-3 text-xs text-blue-700">
          AI推奨分析・ランキング比較・コンテンツ心理分析の3つを同時に実行し、書き起こしデータを多角的に分析します。
        </p>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="追加の分析指示（オプション）: 例）20代女性向けのCMとして分析してください"
          rows={2}
          disabled={running}
          className="w-full rounded-lg border border-blue-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none transition-colors disabled:bg-gray-50 disabled:text-gray-500 mb-3"
        />
        <div className="flex items-center gap-4">
          <button
            onClick={handleRunAll}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:from-blue-700 hover:to-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
          >
            {running ? (
              <>
                <Spinner />
                AI総合分析を実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
              </>
            ) : (
              "AI総合分析を実行"
            )}
          </button>
        </div>
      </div>

      {running && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
            <p className="mt-4 text-gray-600 font-medium">3つの分析を並列実行中...</p>
            <p className="mt-1 text-sm text-gray-400">
              {runningElapsed > 0 ? `${runningElapsed}秒経過` : "しばらくお待ちください"}
            </p>
            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span>AI推奨</span>
              <span>ランキング比較</span>
              <span>心理分析</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Text Search ═══ */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-6">
        <h4 className="mb-3 text-sm font-semibold text-gray-900">テキスト検索</h4>
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="書き起こしテキストを横断検索..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
            />
          </div>
          <button type="submit" disabled={searchLoading || !searchQuery.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {searchLoading ? "検索中..." : "検索"}
          </button>
        </form>
        {searchResults.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 mb-2">{searchTotal}件のセグメントが見つかりました</p>
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2 font-medium text-gray-500">動画</th>
                    <th className="px-4 py-2 font-medium text-gray-500">時間</th>
                    <th className="px-4 py-2 font-medium text-gray-500">テキスト</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {searchResults.map((r) => (
                    <tr key={r.segment_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2">
                        <a href={`/videos/${r.video_id}`} className="text-blue-600 hover:underline font-medium text-xs">{r.video_filename}</a>
                      </td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs whitespace-nowrap">{fmtTime(r.start_time)} - {fmtTime(r.end_time)}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs">{r.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {searchTotal === 0 && !searchLoading && searchQuery && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-gray-400">一致するテキストが見つかりませんでした。</p>
        )}
      </div>

      {/* ═══ AI Recommendations Section ═══ */}
      {aiResult && (
        <Section title="AI推奨分析" icon="🤖" timestamp={aiTimestamp}>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm leading-relaxed text-blue-900">{aiResult.summary}</p>
          </div>

          {aiResult.effective_keywords.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">効果的なキーワード</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiResult.effective_keywords.map((ek, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <span className="inline-block rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white mb-1">{ek.keyword}</span>
                    <p className="text-xs text-gray-700">{ek.reason}</p>
                    {ek.appears_in.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ek.appears_in.map((v, j) => <span key={j} className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{v}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiResult.effective_phrases.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">効果的なフレーズ</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiResult.effective_phrases.map((ep, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <span className="inline-block rounded-md bg-purple-600 px-2 py-0.5 text-xs font-bold text-white mb-1">{ep.phrase}</span>
                    <p className="text-xs text-gray-700">{ep.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiResult.correlation_insights.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">相関インサイト</h5>
              <ul className="space-y-2">
                {aiResult.correlation_insights.map((ci, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 p-3">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${getConfidenceBadge(ci.confidence)}`}>
                      {getConfidenceLabel(ci.confidence)}
                    </span>
                    <p className="text-xs text-gray-700">{ci.insight}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {aiResult.recommendations.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">改善提案</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiResult.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{rec.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPriorityBadge(rec.priority)}`}>
                        {getPriorityLabel(rec.priority)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{rec.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aiResult.funnel_suggestions.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">ファネル改善提案</h5>
              <ol className="space-y-2">
                {aiResult.funnel_suggestions.map((fs, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{fs.stage}</p>
                      <p className="text-xs text-gray-600">{fs.suggestion}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>
      )}

      {/* ═══ Ranking Comparison Section ═══ */}
      {rankingResult && (
        <Section title="ランキング比較分析" icon="🏆" timestamp={rankingTimestamp}>
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
            <p className="text-sm leading-relaxed text-yellow-900">{rankingResult.summary}</p>
          </div>

          {rankingResult.psychological_analysis.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">心理学的分析</h5>
              <div className="space-y-3">
                {rankingResult.psychological_analysis.map((item, i) => (
                  <div key={i} className="rounded-lg border border-purple-100 bg-purple-50 p-3">
                    <h6 className="font-semibold text-purple-900 text-sm">{item.technique}</h6>
                    <p className="mt-1 text-xs text-purple-800">{item.description}</p>
                    {item.examples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.examples.map((ex, j) => (
                          <span key={j} className="text-xs text-purple-700 bg-white/50 rounded px-2 py-0.5">「{ex}」</span>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-purple-600 italic">{item.effectiveness}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rankingResult.storytelling_analysis.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">ストーリーテリング分析</h5>
              <div className="space-y-3">
                {rankingResult.storytelling_analysis.map((item, i) => (
                  <div key={i} className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <h6 className="font-semibold text-blue-900 text-sm">{item.element}</h6>
                    <p className="mt-1 text-xs text-blue-800">{item.description}</p>
                    <p className="mt-1 text-xs text-blue-600 italic">{item.impact}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {rankingResult.linguistic_analysis.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">言語・表現分析</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rankingResult.linguistic_analysis.map((item, i) => (
                  <div key={i} className="rounded-lg border border-green-100 bg-green-50 p-3">
                    <h6 className="font-semibold text-green-900 text-sm">{item.technique}</h6>
                    <p className="mt-1 text-xs text-green-800">{item.description}</p>
                    {item.examples.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.examples.map((ex, j) => <span key={j} className="inline-block rounded bg-green-200 px-1.5 py-0.5 text-xs text-green-800">{ex}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {rankingResult.key_differences.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">主な違い（上位 vs その他）</h5>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">観点</th>
                      <th className="px-3 py-2 text-left font-medium text-yellow-600 text-xs">上位</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 text-xs">その他</th>
                      <th className="px-3 py-2 text-left font-medium text-blue-600 text-xs">インサイト</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rankingResult.key_differences.map((diff, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 text-xs">{diff.aspect}</td>
                        <td className="px-3 py-2 text-yellow-700 bg-yellow-50 text-xs">{diff.top_videos}</td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{diff.other_videos}</td>
                        <td className="px-3 py-2 text-blue-600 text-xs italic">{diff.insight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {rankingResult.recommendations.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">改善提案</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rankingResult.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{rec.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPriorityBadge(rec.priority)}`}>{getPriorityLabel(rec.priority)}</span>
                    </div>
                    <p className="text-xs text-gray-600">{rec.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ═══ Psychological Content Analysis Section ═══ */}
      {psychResult && (
        <Section title="コンテンツ心理分析" icon="🧪" timestamp={psychTimestamp}>
          <div className="rounded-lg bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-4">
            <p className="text-xs text-rose-700 mb-2">
              心理学的分析手法に基づき、動画コンテンツを<strong>3つの軸</strong>（感情ボラティリティ・ストーリーテリング・コンバージョン導線）で分析します。
            </p>
            <p className="text-sm leading-relaxed text-rose-900">{psychResult.overall_summary}</p>
          </div>

          {/* NLP Pre-analysis: Emotion Timeline */}
          {psychResult.nlp_preanalysis && psychResult.nlp_preanalysis.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">NLP感情スコアタイムライン</h5>
              <div className="space-y-3">
                {psychResult.nlp_preanalysis.map((vid, vi) => (
                  <div key={vi} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h6 className="font-semibold text-gray-900 text-xs">{vid.video_name}</h6>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span>偏差: {vid.volatility.volatility_std.toFixed(3)}</span>
                        <span>転換: {vid.volatility.direction_changes}回</span>
                      </div>
                    </div>
                    <div className="flex gap-0.5 items-end h-10">
                      {vid.emotion_segments.map((seg, si) => {
                        const score = seg.emotion_score;
                        const height = Math.max(Math.abs(score) * 100, 4);
                        const bg = score > 0 ? "bg-green-400" : score < 0 ? "bg-red-400" : "bg-gray-300";
                        return <div key={si} className={`flex-1 rounded-t ${bg}`} style={{ height: `${height}%`, minWidth: 2, maxWidth: 16 }}
                          title={`${fmtTime(seg.start_time)}-${fmtTime(seg.end_time)}: ${score > 0 ? "+" : ""}${score.toFixed(2)}`}
                        />;
                      })}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>開始</span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />ポジ</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />ネガ</span>
                      </div>
                      <span>終了</span>
                    </div>
                    {vid.persuasion_techniques.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {vid.persuasion_techniques.map((pt, pi) => (
                          <span key={pi} className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs text-amber-800">
                            {pt.technique}: {pt.matches.join(", ")}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Emotion Volatility */}
          {psychResult.emotion_volatility_analysis?.videos?.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-gray-900">感情ボラティリティ分析</h5>
              <p className="mb-3 text-xs text-gray-600">{psychResult.emotion_volatility_analysis.summary}</p>
              <div className="space-y-3">
                {psychResult.emotion_volatility_analysis.videos.map((vid, i) => (
                  <div key={i} className="rounded-lg border border-red-100 bg-red-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <h6 className="font-semibold text-red-900 text-xs">{vid.video_name}</h6>
                      <span className="text-xs font-bold text-red-700">{vid.volatility_score}/10</span>
                    </div>
                    <p className="text-xs text-red-800">{vid.emotion_arc}</p>
                    {vid.peak_moments?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {vid.peak_moments.map((pm, j) => (
                          <div key={j} className="flex items-start gap-1 text-xs text-red-700 bg-white/50 rounded px-2 py-1">
                            <span className="shrink-0 font-mono bg-red-200 rounded px-1">{pm.timestamp_range}</span>
                            <span className="font-semibold">{pm.emotion}</span>
                            <span>{pm.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-red-600 italic">{vid.evaluation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Storytelling */}
          {psychResult.storytelling_analysis?.videos?.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-gray-900">ストーリーテリング・実用性分析</h5>
              <p className="mb-3 text-xs text-gray-600">{psychResult.storytelling_analysis.summary}</p>
              <div className="space-y-3">
                {psychResult.storytelling_analysis.videos.map((vid, i) => (
                  <div key={i} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                    <h6 className="font-semibold text-indigo-900 text-xs mb-2">{vid.video_name}</h6>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { label: "実用性", score: vid.practical_value_score },
                        { label: "記憶性", score: vid.memorability_score },
                        { label: "共有性", score: vid.shareability_score },
                      ].map((g, gi) => (
                        <div key={gi} className="text-center bg-white/50 rounded p-2">
                          <span className="text-sm font-bold text-indigo-800">{g.score}/10</span>
                          <p className="text-xs text-indigo-600">{g.label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-indigo-800">{vid.story_structure}</p>
                    <p className="mt-2 text-xs text-indigo-600 italic">{vid.evaluation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversion Pipeline */}
          {psychResult.conversion_pipeline_analysis?.videos?.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-gray-900">コンバージョン導線・説得力分析</h5>
              <p className="mb-3 text-xs text-gray-600">{psychResult.conversion_pipeline_analysis.summary}</p>
              <div className="space-y-3">
                {psychResult.conversion_pipeline_analysis.videos.map((vid, i) => (
                  <div key={i} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <h6 className="font-semibold text-emerald-900 text-xs">{vid.video_name}</h6>
                      <span className="text-xs font-bold text-emerald-700">説得力: {vid.persuasion_score}/10</span>
                    </div>
                    {vid.cta_analysis?.cta_moments?.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {vid.cta_analysis.cta_moments.map((cta, j) => (
                          <div key={j} className="flex items-start gap-1 text-xs text-emerald-700 bg-white/60 rounded px-2 py-1">
                            <span className="shrink-0 font-mono bg-emerald-200 rounded px-1">{cta.timestamp_range}</span>
                            <span className="shrink-0 font-semibold">{cta.technique}</span>
                            <span className="flex-1">「{cta.text}」</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-emerald-600 italic">{vid.evaluation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cross-video insights */}
          {psychResult.cross_video_insights?.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">動画横断インサイト</h5>
              <div className="space-y-2">
                {psychResult.cross_video_insights.map((ci, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 p-3">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      ci.confidence === "high" ? "bg-green-100 text-green-800" : ci.confidence === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"
                    }`}>
                      {ci.confidence === "high" ? "高" : ci.confidence === "medium" ? "中" : "低"}
                    </span>
                    <div>
                      <p className="text-xs text-gray-700">{ci.insight}</p>
                      {ci.actionable && <p className="mt-0.5 text-xs text-blue-600 font-medium">アクション: {ci.actionable}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {psychResult.recommendations?.length > 0 && (
            <div>
              <h5 className="mb-3 text-sm font-semibold text-gray-900">改善提案</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {psychResult.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">{rec.category}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        rec.priority === "high" ? "bg-red-100 text-red-800" : rec.priority === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {rec.priority === "high" ? "高" : rec.priority === "medium" ? "中" : "低"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{rec.recommendation}</p>
                    {rec.expected_impact && <p className="mt-1 text-xs text-blue-600 italic">期待効果: {rec.expected_impact}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* No results message */}
      {!aiResult && !rankingResult && !psychResult && !running && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
          <p className="text-gray-500">
            AI分析結果がありません。上の「AI総合分析を実行」ボタンから分析を開始してください。
          </p>
          <p className="mt-2 text-xs text-gray-400">
            書き起こし済みの動画が必要です。ランキング比較にはランキング1〜3位の設定が必要です。
          </p>
        </div>
      )}
    </div>
  );
}
