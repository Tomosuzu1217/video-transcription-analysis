import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  getAnalysisResults,
  runAiRecommendations,
  runPsychologicalContentAnalysis,
  runRankingComparisonAnalysis,
} from "../../api/analysis";
import { searchTranscriptions, type SearchResult } from "../../api/transcriptions";
import { getErrorMessage } from "../../utils/errors";
import type { AiAnalysisResult, PsychologicalContentResult, RankingComparisonResult } from "../../types";

function Section({ title, timestamp, children }: { title: string; timestamp?: string | null; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h4 className="text-base font-semibold text-gray-900">{title}</h4>
        {timestamp && <p className="text-xs text-gray-400">更新日時: {new Date(timestamp).toLocaleString("ja-JP")}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const normalizeAiResult = (result: Partial<AiAnalysisResult>): AiAnalysisResult => ({
  summary: result.summary ?? "",
  effective_keywords: result.effective_keywords ?? [],
  effective_phrases: result.effective_phrases ?? [],
  correlation_insights: result.correlation_insights ?? [],
  recommendations: result.recommendations ?? [],
  funnel_suggestions: result.funnel_suggestions ?? [],
});

const normalizeRankingResult = (result: Partial<RankingComparisonResult>): RankingComparisonResult => ({
  summary: result.summary ?? "",
  psychological_analysis: result.psychological_analysis ?? [],
  storytelling_analysis: result.storytelling_analysis ?? [],
  linguistic_analysis: result.linguistic_analysis ?? [],
  key_differences: result.key_differences ?? [],
  recommendations: result.recommendations ?? [],
});

const priorityLabel = (value: string) => {
  switch (value.toLowerCase()) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return value;
  }
};

const priorityColor = (value: string) => {
  switch (value.toLowerCase()) {
    case "high":
      return "bg-red-100 text-red-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "low":
      return "bg-green-100 text-green-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const confidenceColor = (value: string) => {
  switch (value.toLowerCase()) {
    case "high":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "low":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const formatElapsed = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const formatRange = (start: number, end: number) =>
  `${formatElapsed(Math.floor(start))} - ${formatElapsed(Math.floor(end))}`;

const hasPsychResult = (value: unknown): value is PsychologicalContentResult =>
  value !== null && typeof value === "object" && "overall_summary" in value;

export default function IntegratedAITab() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [runningElapsed, setRunningElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);
  const [rankingResult, setRankingResult] = useState<RankingComparisonResult | null>(null);
  const [rankingTimestamp, setRankingTimestamp] = useState<string | null>(null);
  const [psychResult, setPsychResult] = useState<PsychologicalContentResult | null>(null);
  const [psychTimestamp, setPsychTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const loadExisting = useCallback(async () => {
    try {
      const [aiData, rankData, psychData] = await Promise.all([
        getAnalysisResults("ai_recommendation"),
        getAnalysisResults("ranking_comparison"),
        getAnalysisResults("psychological_content"),
      ]);

      if (aiData[0]) {
        setAiResult(normalizeAiResult(aiData[0].result as Partial<AiAnalysisResult>));
        setAiTimestamp(aiData[0].created_at);
      }
      if (rankData[0]) {
        setRankingResult(normalizeRankingResult(rankData[0].result as Partial<RankingComparisonResult>));
        setRankingTimestamp(rankData[0].created_at);
      }
      if (psychData[0] && hasPsychResult(psychData[0].result)) {
        setPsychResult(psychData[0].result);
        setPsychTimestamp(psychData[0].created_at);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const handleRunAll = async () => {
    if (!window.confirm("Gemini API を使って 3 種類の分析を実行します。続行しますか？")) return;

    try {
      setRunning(true);
      setError(null);
      setRunningElapsed(0);
      timerRef.current = setInterval(() => setRunningElapsed((value) => value + 1), 1000);

      const prompt = customPrompt.trim() || undefined;
      const results = await Promise.allSettled([
        runAiRecommendations(prompt),
        runRankingComparisonAnalysis(prompt),
        runPsychologicalContentAnalysis(prompt),
      ]);

      const failures: string[] = [];

      if (results[0].status === "fulfilled") {
        setAiResult(results[0].value);
        setAiTimestamp(new Date().toISOString());
      } else {
        failures.push(`AI 推奨分析: ${getErrorMessage(results[0].reason, "失敗しました。")}`);
      }

      if (results[1].status === "fulfilled") {
        setRankingResult(results[1].value);
        setRankingTimestamp(new Date().toISOString());
      } else {
        failures.push(`ランキング比較: ${getErrorMessage(results[1].reason, "失敗しました。")}`);
      }

      if (results[2].status === "fulfilled") {
        setPsychResult(results[2].value as PsychologicalContentResult);
        setPsychTimestamp(new Date().toISOString());
      } else {
        failures.push(`心理分析: ${getErrorMessage(results[2].reason, "失敗しました。")}`);
      }

      if (failures.length > 0) setError(failures.join("\n"));
    } catch (cause) {
      setError(getErrorMessage(cause, "分析の実行に失敗しました。"));
    } finally {
      setRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    try {
      setSearchLoading(true);
      setHasSearched(true);
      const data = await searchTranscriptions(query);
      setSearchResults(data.results);
      setSearchTotal(data.total);
    } catch (cause) {
      setError(getErrorMessage(cause, "テキスト検索に失敗しました。"));
    } finally {
      setSearchLoading(false);
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
      {error && <div className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <h4 className="text-sm font-semibold text-blue-900">AI 一括分析</h4>
        <p className="mt-2 text-xs text-blue-700">AI 推奨分析、ランキング比較、心理分析をまとめて実行します。</p>
        <textarea
          value={customPrompt}
          onChange={(event) => setCustomPrompt(event.target.value)}
          placeholder="追加指示を入力してください"
          rows={3}
          disabled={running}
          className="mt-4 w-full resize-none rounded-lg border border-blue-300 px-3 py-2 text-sm text-gray-900"
        />
        <div className="mt-4 flex items-center gap-4">
          <button type="button" onClick={handleRunAll} disabled={running} className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60">
            {running ? `分析を実行中 (${formatElapsed(runningElapsed)})` : "一括分析を実行"}
          </button>
          {running && <span className="text-xs text-blue-700">処理中です。画面はそのままで問題ありません。</span>}
        </div>
      </section>

      <Section title="テキスト検索">
        <form onSubmit={handleSearch} className="flex items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => {
              const value = event.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setHasSearched(false);
                setSearchResults([]);
                setSearchTotal(0);
              }
            }}
            placeholder="検索キーワードを入力"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <button type="submit" disabled={searchLoading || !searchQuery.trim()} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-60">
            {searchLoading ? "検索中..." : "検索"}
          </button>
        </form>
        {searchTotal > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-2 font-medium text-gray-500">動画</th>
                  <th className="px-4 py-2 font-medium text-gray-500">時間</th>
                  <th className="px-4 py-2 font-medium text-gray-500">テキスト</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {searchResults.map((result) => (
                  <tr key={result.segment_id}>
                    <td className="px-4 py-2 text-xs text-blue-600">{result.video_filename}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{formatRange(result.start_time, result.end_time)}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{result.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasSearched && !searchLoading && searchTotal === 0 && <p className="text-sm text-gray-400">該当するテキストは見つかりませんでした。</p>}
      </Section>

      {aiResult && (
        <Section title="AI 推奨分析" timestamp={aiTimestamp}>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{aiResult.summary}</div>
          {aiResult.effective_keywords.length > 0 && (
            <div>
              <h5 className="mb-2 text-sm font-semibold text-gray-900">効果的なキーワード</h5>
              <div className="flex flex-wrap gap-2">
                {aiResult.effective_keywords.map((item, index) => (
                  <span key={`${item.keyword}-${index}`} className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
                    {item.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
          {aiResult.recommendations.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {aiResult.recommendations.map((item, index) => (
                <div key={`${item.category}-${index}`} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-900">{item.category}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor(item.priority)}`}>{priorityLabel(item.priority)}</span>
                  </div>
                  <p className="text-xs text-gray-600">{item.recommendation}</p>
                </div>
              ))}
            </div>
          )}
          {aiResult.correlation_insights.length > 0 && (
            <div className="space-y-2">
              {aiResult.correlation_insights.map((item, index) => (
                <div key={`${item.insight}-${index}`} className="flex items-start gap-2 rounded-lg bg-gray-50 p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${confidenceColor(item.confidence)}`}>{priorityLabel(item.confidence)}</span>
                  <p className="text-xs text-gray-700">{item.insight}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {rankingResult && (
        <Section title="ランキング比較分析" timestamp={rankingTimestamp}>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">{rankingResult.summary}</div>
          {rankingResult.key_differences.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">観点</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-yellow-700">上位動画</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">その他動画</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rankingResult.key_differences.map((item, index) => (
                    <tr key={`${item.aspect}-${index}`}>
                      <td className="px-3 py-2 text-xs font-medium text-gray-900">{item.aspect}</td>
                      <td className="px-3 py-2 text-xs text-yellow-800">{item.top_videos}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{item.other_videos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rankingResult.recommendations.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rankingResult.recommendations.map((item, index) => (
                <div key={`${item.category}-${index}`} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-900">{item.category}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor(item.priority)}`}>{priorityLabel(item.priority)}</span>
                  </div>
                  <p className="text-xs text-gray-600">{item.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {psychResult && (
        <Section title="心理分析" timestamp={psychTimestamp}>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{psychResult.overall_summary}</div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {psychResult.emotion_volatility_analysis.videos.slice(0, 4).map((video, index) => (
              <div key={`${video.video_name}-${index}`} className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-xs font-semibold text-red-900">{video.video_name}</h5>
                  <span className="text-xs font-bold text-red-700">{video.volatility_score}/10</span>
                </div>
                <p className="mt-2 text-xs text-red-800">{video.emotion_arc}</p>
                <p className="mt-2 text-xs italic text-red-600">{video.evaluation}</p>
              </div>
            ))}
            {psychResult.storytelling_analysis.videos.slice(0, 2).map((video, index) => (
              <div key={`${video.video_name}-story-${index}`} className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                <h5 className="text-xs font-semibold text-indigo-900">{video.video_name}</h5>
                <p className="mt-2 text-xs text-indigo-800">{video.story_structure}</p>
                <p className="mt-2 text-xs text-indigo-600">
                  実用性 {video.practical_value_score}/10 ・ 記憶残り {video.memorability_score}/10 ・ 共有性 {video.shareability_score}/10
                </p>
              </div>
            ))}
          </div>
          {psychResult.cross_video_insights.length > 0 && (
            <div className="space-y-2">
              {psychResult.cross_video_insights.map((item, index) => (
                <div key={`${item.insight}-${index}`} className="rounded-lg bg-gray-50 p-3">
                  <div className="flex items-start gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${confidenceColor(item.confidence)}`}>{priorityLabel(item.confidence)}</span>
                    <div>
                      <p className="text-xs text-gray-700">{item.insight}</p>
                      {item.actionable && <p className="mt-1 text-xs font-medium text-blue-600">アクション: {item.actionable}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {!aiResult && !rankingResult && !psychResult && !running && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          分析結果はまだありません。
        </div>
      )}
    </div>
  );
}
