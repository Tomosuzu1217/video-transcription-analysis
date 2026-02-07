import { useState, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import {
  runKeywordAnalysis,
  runCorrelationAnalysis,
  runAiRecommendations,
  runRankingComparisonAnalysis,
  runPsychologicalContentAnalysis,
  getAnalysisResults,
} from "../api/analysis";
import { searchTranscriptions, getAllTranscriptions, type SearchResult, type FullTranscription } from "../api/transcriptions";
import type { KeywordItem, CorrelationItem, AiAnalysisResult, RankingComparisonResult, PsychologicalContentResult } from "../types";

type TabKey = "keyword" | "correlation" | "ai" | "ranking" | "psych" | "search" | "transcripts" | "history";

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: "keyword", label: "キーワード分析" },
  { key: "correlation", label: "相関分析" },
  { key: "ai", label: "AI分析" },
  { key: "ranking", label: "ランキング比較" },
  { key: "psych", label: "コンテンツ心理分析" },
  { key: "search", label: "テキスト検索" },
  { key: "transcripts", label: "書き起こし一覧" },
  { key: "history", label: "履歴" },
];

interface AnalysisRecord {
  id: number;
  analysis_type: string;
  scope: string;
  video_id: number | null;
  result: Record<string, unknown>;
  gemini_model_used: string | null;
  created_at: string;
}

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("keyword");

  // --- Keyword state ---
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordRunning, setKeywordRunning] = useState(false);

  // --- Correlation state ---
  const [correlations, setCorrelations] = useState<CorrelationItem[]>([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationRunning, setCorrelationRunning] = useState(false);

  // --- AI state ---
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiCustomPrompt, setAiCustomPrompt] = useState("");

  // --- Ranking comparison state ---
  const [rankingResult, setRankingResult] = useState<RankingComparisonResult | null>(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingRunning, setRankingRunning] = useState(false);
  const [rankingCustomPrompt, setRankingCustomPrompt] = useState("");
  const [rankingTimestamp, setRankingTimestamp] = useState<string | null>(null);

  // --- Psychological content analysis state ---
  const [psychResult, setPsychResult] = useState<PsychologicalContentResult | null>(null);
  const [psychLoading, setPsychLoading] = useState(false);
  const [psychRunning, setPsychRunning] = useState(false);
  const [psychCustomPrompt, setPsychCustomPrompt] = useState("");
  const [psychTimestamp, setPsychTimestamp] = useState<string | null>(null);

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  // --- History state ---
  const [historyRecords, setHistoryRecords] = useState<AnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<AnalysisRecord | null>(null);

  // --- Transcripts state ---
  const [allTranscripts, setAllTranscripts] = useState<FullTranscription[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [expandedVideoId, setExpandedVideoId] = useState<number | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Elapsed time counter for running operations
  const [runningElapsed, setRunningElapsed] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startElapsedTimer = () => {
    setRunningElapsed(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setRunningElapsed((e) => e + 1), 1000);
  };

  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, []);

  // Timestamps for freshness display
  const [keywordTimestamp, setKeywordTimestamp] = useState<string | null>(null);
  const [correlationTimestamp, setCorrelationTimestamp] = useState<string | null>(null);
  const [aiTimestamp, setAiTimestamp] = useState<string | null>(null);

  // ─── Fetch existing results on mount ───────────────────────────
  const fetchKeywordResults = async () => {
    try {
      setKeywordLoading(true);
      const data = await getAnalysisResults("keyword_frequency");
      if (data && data.length > 0) {
        const latest = data[0];
        const result = latest.result;
        const keywords: KeywordItem[] = result?.keywords ?? [];
        setKeywords(keywords);
        setKeywordTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("キーワード結果の取得に失敗:", err);
    } finally {
      setKeywordLoading(false);
    }
  };

  const fetchCorrelationResults = async () => {
    try {
      setCorrelationLoading(true);
      const data = await getAnalysisResults("correlation");
      if (data && data.length > 0) {
        const latest = data[0];
        const result = latest.result;
        const correlations: CorrelationItem[] = result?.correlations ?? [];
        setCorrelations(correlations);
        setCorrelationTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("相関分析結果の取得に失敗:", err);
    } finally {
      setCorrelationLoading(false);
    }
  };

  const fetchAiResults = async () => {
    try {
      setAiLoading(true);
      const data = await getAnalysisResults("ai_recommendation");
      if (data && data.length > 0) {
        const latest = data[0];
        const raw = latest.result;
        if (raw && typeof raw === "object" && "summary" in raw) {
          const parsed: AiAnalysisResult = {
            summary: raw.summary ?? "",
            effective_keywords: raw.effective_keywords ?? [],
            effective_phrases: raw.effective_phrases ?? [],
            correlation_insights: raw.correlation_insights ?? [],
            recommendations: raw.recommendations ?? [],
            funnel_suggestions: raw.funnel_suggestions ?? [],
          };
          setAiResult(parsed);
        }
        setAiTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("AI分析結果の取得に失敗:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const fetchRankingResults = async () => {
    try {
      setRankingLoading(true);
      const data = await getAnalysisResults("ranking_comparison");
      if (data && data.length > 0) {
        const latest = data[0];
        const raw = latest.result;
        if (raw && typeof raw === "object" && "summary" in raw) {
          const parsed: RankingComparisonResult = {
            summary: raw.summary ?? "",
            psychological_analysis: raw.psychological_analysis ?? [],
            storytelling_analysis: raw.storytelling_analysis ?? [],
            linguistic_analysis: raw.linguistic_analysis ?? [],
            key_differences: raw.key_differences ?? [],
            recommendations: raw.recommendations ?? [],
          };
          setRankingResult(parsed);
        }
        setRankingTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("ランキング比較分析結果の取得に失敗:", err);
    } finally {
      setRankingLoading(false);
    }
  };

  const fetchPsychResults = async () => {
    try {
      setPsychLoading(true);
      const data = await getAnalysisResults("psychological_content");
      if (data && data.length > 0) {
        const latest = data[0];
        const raw = latest.result;
        if (raw && typeof raw === "object" && "overall_summary" in raw) {
          setPsychResult(raw as unknown as PsychologicalContentResult);
        }
        setPsychTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("心理分析結果の取得に失敗:", err);
    } finally {
      setPsychLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const data = await getAnalysisResults();
      setHistoryRecords(data as AnalysisRecord[]);
    } catch (err) {
      console.error("履歴取得に失敗:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchAllTranscripts = async () => {
    try {
      setTranscriptsLoading(true);
      const data = await getAllTranscriptions();
      setAllTranscripts(data.transcriptions);
    } catch (err) {
      console.error("書き起こし一覧の取得に失敗:", err);
    } finally {
      setTranscriptsLoading(false);
    }
  };

  // Track which tabs have been loaded to avoid refetching
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set());

  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    setLoadedTabs((prev) => new Set(prev).add(activeTab));

    switch (activeTab) {
      case "keyword":
        fetchKeywordResults();
        break;
      case "correlation":
        fetchCorrelationResults();
        break;
      case "ai":
        fetchAiResults();
        break;
      case "ranking":
        fetchRankingResults();
        break;
      case "psych":
        fetchPsychResults();
        break;
      case "transcripts":
        fetchAllTranscripts();
        break;
      case "history":
        fetchHistory();
        break;
    }
  }, [activeTab]);

  // ─── Run analysis handlers ─────────────────────────────────────
  const handleRunKeyword = async () => {
    try {
      setKeywordRunning(true);
      setError(null);
      startElapsedTimer();
      await runKeywordAnalysis();
      await fetchKeywordResults();
    } catch (err) {
      setError("キーワード分析の実行に失敗しました。");
      console.error(err);
    } finally {
      setKeywordRunning(false);
      stopElapsedTimer();
    }
  };

  const handleRunCorrelation = async () => {
    try {
      setCorrelationRunning(true);
      setError(null);
      startElapsedTimer();
      await runCorrelationAnalysis();
      await fetchCorrelationResults();
    } catch (err) {
      setError("相関分析の実行に失敗しました。");
      console.error(err);
    } finally {
      setCorrelationRunning(false);
      stopElapsedTimer();
    }
  };

  const handleRunAi = async () => {
    try {
      setAiRunning(true);
      setError(null);
      startElapsedTimer();
      await runAiRecommendations(aiCustomPrompt.trim() || undefined);
      await fetchAiResults();
    } catch (err: any) {
      const message = err?.response?.data?.detail || "AI分析の実行に失敗しました。";
      setError(message);
      console.error(err);
    } finally {
      setAiRunning(false);
      stopElapsedTimer();
    }
  };

  const handleRunRankingComparison = async () => {
    try {
      setRankingRunning(true);
      setError(null);
      startElapsedTimer();
      await runRankingComparisonAnalysis(rankingCustomPrompt.trim() || undefined);
      await fetchRankingResults();
    } catch (err: any) {
      const message = err?.response?.data?.detail || "ランキング比較分析の実行に失敗しました。";
      setError(message);
      console.error(err);
    } finally {
      setRankingRunning(false);
      stopElapsedTimer();
    }
  };

  const handleRunPsychological = async () => {
    try {
      setPsychRunning(true);
      setError(null);
      startElapsedTimer();
      await runPsychologicalContentAnalysis(psychCustomPrompt.trim() || undefined);
      await fetchPsychResults();
    } catch (err: any) {
      const message = err?.response?.data?.detail || "心理コンテンツ分析の実行に失敗しました。";
      setError(message);
      console.error(err);
    } finally {
      setPsychRunning(false);
      stopElapsedTimer();
    }
  };

  // ─── Helpers ───────────────────────────────────────────────────
  const sortedKeywords = [...keywords].sort((a, b) => b.count - a.count);
  const top50Keywords = sortedKeywords.slice(0, 50);
  const top20ChartData = sortedKeywords.slice(0, 20).map((kw) => ({
    keyword: kw.keyword,
    count: kw.count,
  }));

  const getEffectBadge = (score: number) => {
    if (score > 1.5) {
      return { label: "高効果", className: "bg-green-100 text-green-800 border border-green-200" };
    }
    if (score >= 1.0) {
      return { label: "中効果", className: "bg-yellow-100 text-yellow-800 border border-yellow-200" };
    }
    return { label: "低効果", className: "bg-red-100 text-red-800 border border-red-200" };
  };

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence.toLowerCase()) {
      case "high":
        return "bg-green-100 text-green-800 border border-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      case "low":
        return "bg-red-100 text-red-800 border border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  const getConfidenceLabel = (confidence: string) => {
    switch (confidence.toLowerCase()) {
      case "high":
        return "高";
      case "medium":
        return "中";
      case "low":
        return "低";
      default:
        return confidence;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-red-100 text-red-800 border border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border border-gray-200";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "高";
      case "medium":
        return "中";
      case "low":
        return "低";
      default:
        return priority;
    }
  };

  const scatterData = correlations.map((c) => ({
    keyword: c.keyword,
    effectiveness_score: c.effectiveness_score,
    avg_conversion_with: c.avg_conversion_with,
    video_count: c.video_count,
  }));

  // ─── CSV export helper ────────────────────────────────────────
  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const bom = "\uFEFF";
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportKeywordsCsv = () => {
    downloadCsv(
      "keywords.csv",
      ["#", "キーワード", "出現回数", "出現動画数"],
      top50Keywords.map((kw, i) => [
        String(i + 1),
        `"${kw.keyword}"`,
        String(kw.count),
        String(Object.keys(kw.video_counts).length),
      ]),
    );
  };

  const handleExportCorrelationCsv = () => {
    downloadCsv(
      "correlation.csv",
      ["キーワード", "キーワードあり平均CV", "キーワードなし平均CV", "効果スコア", "出現動画数"],
      correlations.map((c) => [
        `"${c.keyword}"`,
        c.avg_conversion_with.toFixed(2),
        c.avg_conversion_without.toFixed(2),
        c.effectiveness_score.toFixed(2),
        String(c.video_count),
      ]),
    );
  };

  const formatTimestamp = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const TimestampBadge = ({ ts }: { ts: string | null }) => {
    if (!ts) return null;
    return (
      <span className="text-xs text-gray-400">
        最終実行: {formatTimestamp(ts)}
      </span>
    );
  };

  // ─── Loading spinner component ─────────────────────────────────
  const Spinner = () => (
    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
  );

  const PageSpinner = ({ text }: { text: string }) => (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        <p className="mt-3 text-gray-500">{text}</p>
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page title */}
      <h2 className="text-2xl font-bold text-gray-900">詳細分析</h2>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ══════════════ Tab 1: キーワード分析 ══════════════ */}
      {activeTab === "keyword" && (
        <div className="space-y-6">
          {/* Run button + CSV export */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleRunKeyword}
              disabled={keywordRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {keywordRunning ? (
                <>
                  <Spinner />
                  分析実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
                </>
              ) : (
                "キーワード分析を実行"
              )}
            </button>
            {keywords.length > 0 && (
              <button
                onClick={handleExportKeywordsCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                CSV
              </button>
            )}
            <TimestampBadge ts={keywordTimestamp} />
          </div>

          {keywordLoading ? (
            <PageSpinner text="キーワードデータを読み込み中..." />
          ) : keywords.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                キーワード分析結果がありません。上のボタンから分析を実行してください。
              </p>
            </div>
          ) : (
            <>
              {/* Bar chart - top 20 */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  トップ20キーワード
                </h3>
                <div style={{ width: "100%", minWidth: 300, height: 450, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
                    <BarChart
                      data={top20ChartData}
                      margin={{ top: 10, right: 30, left: 10, bottom: 80 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="keyword"
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                        tick={{ fontSize: 12 }}
                        height={80}
                      />
                      <YAxis allowDecimals={false} />
                      <Tooltip
                        formatter={(value) => [`${value}回`, "出現回数"]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        }}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Results table - top 50 */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">
                    キーワード一覧（上位50件）
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 font-medium text-gray-500">#</th>
                        <th className="px-6 py-3 font-medium text-gray-500">キーワード</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">出現回数</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">出現動画数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {top50Keywords.map((kw, i) => (
                        <tr key={kw.keyword} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-3 text-gray-400">{i + 1}</td>
                          <td className="px-6 py-3 font-medium text-gray-900">{kw.keyword}</td>
                          <td className="px-6 py-3 text-right text-gray-700">{kw.count}</td>
                          <td className="px-6 py-3 text-right text-gray-700">
                            {Object.keys(kw.video_counts).length}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ Tab 2: 相関分析 ══════════════ */}
      {activeTab === "correlation" && (
        <div className="space-y-6">
          {/* Run button + CSV export */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleRunCorrelation}
              disabled={correlationRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {correlationRunning ? (
                <>
                  <Spinner />
                  分析実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
                </>
              ) : (
                "相関分析を実行"
              )}
            </button>
            {correlations.length > 0 && (
              <button
                onClick={handleExportCorrelationCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                CSV
              </button>
            )}
            <TimestampBadge ts={correlationTimestamp} />
          </div>

          {correlationLoading ? (
            <PageSpinner text="相関分析データを読み込み中..." />
          ) : correlations.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                相関分析結果がありません。上のボタンから分析を実行してください。
              </p>
            </div>
          ) : (
            <>
              {/* Scatter chart */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  効果スコア vs コンバージョン率
                </h3>
                <div style={{ width: "100%", minWidth: 300, height: 400, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="effectiveness_score"
                        type="number"
                        name="効果スコア"
                        tick={{ fontSize: 12 }}
                      >
                      </XAxis>
                      <YAxis
                        dataKey="avg_conversion_with"
                        type="number"
                        name="平均CV（キーワードあり）"
                        tick={{ fontSize: 12 }}
                      >
                      </YAxis>
                      <ZAxis range={[60, 200]} />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={({ payload }) => {
                          if (!payload || payload.length === 0) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-md text-sm">
                              <p className="font-semibold text-gray-900">{d.keyword}</p>
                              <p className="text-gray-600">
                                効果スコア: {d.effectiveness_score.toFixed(2)}
                              </p>
                              <p className="text-gray-600">
                                平均CV（あり）: {d.avg_conversion_with.toFixed(2)}
                              </p>
                              <p className="text-gray-600">動画数: {d.video_count}</p>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={scatterData} fill="#3b82f6" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Results table */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">相関分析結果</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 font-medium text-gray-500">キーワード</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">
                          キーワードあり平均CV
                        </th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">
                          キーワードなし平均CV
                        </th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-center">
                          効果スコア
                        </th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">
                          出現動画数
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {correlations.map((c) => {
                        const badge = getEffectBadge(c.effectiveness_score);
                        return (
                          <tr key={c.keyword} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-gray-900">{c.keyword}</td>
                            <td className="px-6 py-3 text-right text-gray-700">
                              {c.avg_conversion_with.toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-right text-gray-700">
                              {c.avg_conversion_without.toFixed(2)}
                            </td>
                            <td className="px-6 py-3 text-center">
                              <span
                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                              >
                                {c.effectiveness_score.toFixed(2)} {badge.label}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-right text-gray-700">{c.video_count}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════ Tab 3: AI分析 ══════════════ */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          {/* Custom prompt input */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">カスタムプロンプト（オプション）</h4>
            <p className="mb-3 text-xs text-gray-500">
              追加の分析指示を入力すると、AIがその指示を考慮して分析を行います。
            </p>
            <textarea
              value={aiCustomPrompt}
              onChange={(e) => setAiCustomPrompt(e.target.value)}
              placeholder="例: 若年層向けのCMに焦点を当てて分析してください。特にSNSでバズりやすい要素を抽出してください。"
              rows={3}
              disabled={aiRunning}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Run button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.confirm("Gemini APIを使用してAI分析を実行します。APIの使用量が消費されますが、よろしいですか?")) {
                  handleRunAi();
                }
              }}
              disabled={aiRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {aiRunning ? (
                <>
                  <Spinner />
                  Gemini APIで分析中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
                </>
              ) : (
                "AI分析を実行"
              )}
            </button>
            <TimestampBadge ts={aiTimestamp} />
          </div>

          {aiRunning && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
                <p className="mt-4 text-gray-600 font-medium">Gemini APIで分析中...</p>
                <p className="mt-1 text-sm text-gray-400">
                  {runningElapsed > 0 ? `${runningElapsed}秒経過` : "しばらくお待ちください"}
                </p>
              </div>
            </div>
          )}

          {aiLoading ? (
            <PageSpinner text="AI分析データを読み込み中..." />
          ) : !aiResult && !aiRunning ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                AI分析結果がありません。上のボタンから分析を実行してください。
              </p>
            </div>
          ) : aiResult && !aiRunning ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-6">
                <h4 className="mb-2 text-sm font-semibold text-blue-800">概要サマリー</h4>
                <p className="text-sm leading-relaxed text-blue-900">{aiResult.summary}</p>
              </div>

              {/* Effective keywords */}
              {aiResult.effective_keywords.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900">
                    効果的なキーワード
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResult.effective_keywords.map((ek, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="mb-2">
                          <span className="inline-block rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">
                            {ek.keyword}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{ek.reason}</p>
                        {ek.appears_in.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {ek.appears_in.map((vid, j) => (
                              <span
                                key={j}
                                className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                              >
                                {vid}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Effective phrases */}
              {aiResult.effective_phrases.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900">
                    効果的なフレーズ
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResult.effective_phrases.map((ep, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="mb-2">
                          <span className="inline-block rounded-md bg-purple-600 px-2.5 py-1 text-xs font-bold text-white">
                            {ep.phrase}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{ep.reason}</p>
                        {ep.appears_in.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {ep.appears_in.map((vid, j) => (
                              <span
                                key={j}
                                className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                              >
                                {vid}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Correlation insights */}
              {aiResult.correlation_insights.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900">
                    相関インサイト
                  </h4>
                  <ul className="space-y-3">
                    {aiResult.correlation_insights.map((ci, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4"
                      >
                        <span
                          className={`mt-0.5 shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getConfidenceBadge(ci.confidence)}`}
                        >
                          信頼度: {getConfidenceLabel(ci.confidence)}
                        </span>
                        <p className="text-sm text-gray-700 leading-relaxed">{ci.insight}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {aiResult.recommendations.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900">改善提案</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiResult.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {rec.category}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPriorityBadge(rec.priority)}`}
                          >
                            優先度: {getPriorityLabel(rec.priority)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                          {rec.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Funnel suggestions */}
              {aiResult.funnel_suggestions.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900">
                    ファネル改善提案
                  </h4>
                  <ol className="space-y-4">
                    {aiResult.funnel_suggestions.map((fs, i) => (
                      <li key={i} className="flex items-start gap-4">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{fs.stage}</p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-600">
                            {fs.suggestion}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ══════════════ Tab 4: ランキング比較分析 ══════════════ */}
      {activeTab === "ranking" && (
        <div className="space-y-6">
          {/* Description */}
          <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🏆</span>
              <div>
                <h4 className="text-base font-semibold text-yellow-900">ランキング比較分析とは</h4>
                <p className="mt-1 text-sm text-yellow-800">
                  あなたが高く評価した動画（ランキング1〜3位）と、その他の動画を比較し、
                  <strong>心理学的</strong>・<strong>ストーリーテリング的</strong>な観点から
                  なぜ上位動画が優れているのかをAIが詳細に分析します。
                </p>
                <p className="mt-2 text-xs text-yellow-700">
                  ※ 事前に動画詳細ページでランキングを設定してください
                </p>
              </div>
            </div>
          </div>

          {/* Custom prompt input */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">カスタムプロンプト（オプション）</h4>
            <p className="mb-3 text-xs text-gray-500">
              追加の分析指示を入力すると、AIがその指示を考慮して分析を行います。
            </p>
            <textarea
              value={rankingCustomPrompt}
              onChange={(e) => setRankingCustomPrompt(e.target.value)}
              placeholder="例: 特に20代女性向けのCMとして、どのような心理的要素が効果的か分析してください。"
              rows={3}
              disabled={rankingRunning}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Run button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.confirm("Gemini APIを使用してランキング比較分析を実行します。APIの使用量が消費されますが、よろしいですか?")) {
                  handleRunRankingComparison();
                }
              }}
              disabled={rankingRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:from-yellow-600 hover:to-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {rankingRunning ? (
                <>
                  <Spinner />
                  分析中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
                </>
              ) : (
                <>
                  <span>🔍</span>
                  ランキング比較分析を実行
                </>
              )}
            </button>
            <TimestampBadge ts={rankingTimestamp} />
          </div>

          {rankingRunning && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-yellow-500 border-r-transparent" />
                <p className="mt-4 text-gray-600 font-medium">心理学・ストーリーテリング分析中...</p>
                <p className="mt-1 text-sm text-gray-400">
                  {runningElapsed > 0 ? `${runningElapsed}秒経過` : "しばらくお待ちください"}
                </p>
              </div>
            </div>
          )}

          {rankingLoading ? (
            <PageSpinner text="ランキング比較分析データを読み込み中..." />
          ) : !rankingResult && !rankingRunning ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                ランキング比較分析結果がありません。上のボタンから分析を実行してください。
              </p>
              <p className="mt-2 text-xs text-gray-400">
                ※ 事前に動画詳細ページでランキング（1〜3位）を設定する必要があります
              </p>
            </div>
          ) : rankingResult && !rankingRunning ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-6">
                <h4 className="mb-2 text-sm font-semibold text-yellow-800">分析サマリー</h4>
                <p className="text-sm leading-relaxed text-yellow-900">{rankingResult.summary}</p>
              </div>

              {/* Psychological Analysis */}
              {rankingResult.psychological_analysis.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>🧠</span> 心理学的分析
                  </h4>
                  <div className="space-y-4">
                    {rankingResult.psychological_analysis.map((item, i) => (
                      <div key={i} className="rounded-lg border border-purple-100 bg-purple-50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-purple-600 text-white text-sm font-bold">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <h5 className="font-semibold text-purple-900">{item.technique}</h5>
                            <p className="mt-1 text-sm text-purple-800">{item.description}</p>
                            {item.examples.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-purple-700">具体例:</p>
                                <ul className="mt-1 space-y-1">
                                  {item.examples.map((ex, j) => (
                                    <li key={j} className="text-xs text-purple-700 bg-white/50 rounded px-2 py-1">
                                      「{ex}」
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <p className="mt-2 text-xs text-purple-600 italic">{item.effectiveness}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Storytelling Analysis */}
              {rankingResult.storytelling_analysis.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>📖</span> ストーリーテリング分析
                  </h4>
                  <div className="space-y-4">
                    {rankingResult.storytelling_analysis.map((item, i) => (
                      <div key={i} className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-bold">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <h5 className="font-semibold text-blue-900">{item.element}</h5>
                            <p className="mt-1 text-sm text-blue-800">{item.description}</p>
                            {item.examples.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-blue-700">具体例:</p>
                                <ul className="mt-1 space-y-1">
                                  {item.examples.map((ex, j) => (
                                    <li key={j} className="text-xs text-blue-700 bg-white/50 rounded px-2 py-1">
                                      「{ex}」
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <p className="mt-2 text-xs text-blue-600 italic">{item.impact}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linguistic Analysis */}
              {rankingResult.linguistic_analysis.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>✍️</span> 言語・表現分析
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rankingResult.linguistic_analysis.map((item, i) => (
                      <div key={i} className="rounded-lg border border-green-100 bg-green-50 p-4">
                        <h5 className="font-semibold text-green-900">{item.technique}</h5>
                        <p className="mt-1 text-sm text-green-800">{item.description}</p>
                        {item.examples.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.examples.map((ex, j) => (
                              <span key={j} className="inline-block rounded bg-green-200 px-2 py-0.5 text-xs text-green-800">
                                {ex}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Differences */}
              {rankingResult.key_differences.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>⚖️</span> 主な違い（上位 vs その他）
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-3 text-left font-medium text-gray-500">比較観点</th>
                          <th className="px-4 py-3 text-left font-medium text-yellow-600">上位動画</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-500">その他</th>
                          <th className="px-4 py-3 text-left font-medium text-blue-600">インサイト</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rankingResult.key_differences.map((diff, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{diff.aspect}</td>
                            <td className="px-4 py-3 text-yellow-700 bg-yellow-50">{diff.top_videos}</td>
                            <td className="px-4 py-3 text-gray-600">{diff.other_videos}</td>
                            <td className="px-4 py-3 text-blue-600 text-xs italic">{diff.insight}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {rankingResult.recommendations.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>💡</span> 改善提案
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rankingResult.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">
                            {rec.category}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getPriorityBadge(rec.priority)}`}
                          >
                            優先度: {getPriorityLabel(rec.priority)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">
                          {rec.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ══════════════ Tab: コンテンツ心理分析 ══════════════ */}
      {activeTab === "psych" && (
        <div className="space-y-6">
          {/* Description */}
          <div className="rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-6">
            <div className="flex items-start gap-4">
              <span className="text-3xl">🧪</span>
              <div>
                <h4 className="text-base font-semibold text-rose-900">コンテンツ心理分析とは</h4>
                <p className="mt-1 text-sm text-rose-800">
                  Dラボのメソッドに基づき、動画コンテンツを<strong>3つの心理学的軸</strong>で詳細分析します：
                </p>
                <ul className="mt-2 space-y-1 text-sm text-rose-800">
                  <li><strong>1. 感情ボラティリティ</strong> - 感情の起伏が視聴者をどれだけ惹きつけるか</li>
                  <li><strong>2. ストーリーテリング実用性</strong> - 人に話したくなる実用的な物語になっているか</li>
                  <li><strong>3. コンバージョン導線</strong> - 登録行動への自然な接続と説得力</li>
                </ul>
                <p className="mt-2 text-xs text-rose-600">
                  NLPによる感情語・説得技法の事前分析 + Gemini AIによる総合心理分析を実行します
                </p>
              </div>
            </div>
          </div>

          {/* Custom prompt input */}
          <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
            <h4 className="mb-3 text-sm font-semibold text-gray-900">カスタムプロンプト（オプション）</h4>
            <p className="mb-3 text-xs text-gray-500">
              追加の分析指示を入力すると、AIがその指示を考慮して分析を行います。
            </p>
            <textarea
              value={psychCustomPrompt}
              onChange={(e) => setPsychCustomPrompt(e.target.value)}
              placeholder="例: 20代男性向けのDラボ入会広告として、感情の起伏パターンと登録率の関係を重点的に分析してください。"
              rows={3}
              disabled={psychRunning}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 focus:outline-none resize-none transition-colors disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          {/* Run button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.confirm("Gemini APIを使用してコンテンツ心理分析を実行します。APIの使用量が消費されますが、よろしいですか?")) {
                  handleRunPsychological();
                }
              }}
              disabled={psychRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:from-rose-600 hover:to-pink-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {psychRunning ? (
                <>
                  <Spinner />
                  分析中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}
                </>
              ) : (
                <>
                  <span>🧪</span>
                  コンテンツ心理分析を実行
                </>
              )}
            </button>
            <TimestampBadge ts={psychTimestamp} />
          </div>

          {psychRunning && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-rose-500 border-r-transparent" />
                <p className="mt-4 text-gray-600 font-medium">感情ボラティリティ・ストーリーテリング・コンバージョン導線を分析中...</p>
                <p className="mt-1 text-sm text-gray-400">
                  {runningElapsed > 0 ? `${runningElapsed}秒経過` : "NLP前処理 + AI分析を実行しています"}
                </p>
              </div>
            </div>
          )}

          {psychLoading ? (
            <PageSpinner text="心理分析データを読み込み中..." />
          ) : !psychResult && !psychRunning ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">
                心理分析結果がありません。上のボタンから分析を実行してください。
              </p>
              <p className="mt-2 text-xs text-gray-400">
                書き起こし済みの動画が必要です
              </p>
            </div>
          ) : psychResult && !psychRunning ? (
            <div className="space-y-6">
              {/* Overall Summary */}
              <div className="rounded-xl bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200 p-6">
                <h4 className="mb-2 text-sm font-semibold text-rose-800">総合分析サマリー</h4>
                <p className="text-sm leading-relaxed text-rose-900">{psychResult.overall_summary}</p>
              </div>

              {/* NLP Pre-analysis: Emotion Timeline */}
              {psychResult.nlp_preanalysis && psychResult.nlp_preanalysis.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>📊</span> NLP感情スコアタイムライン
                  </h4>
                  <div className="space-y-4">
                    {psychResult.nlp_preanalysis.map((vid, vi) => (
                      <div key={vi} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 text-sm">{vid.video_name}</h5>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>標準偏差: {vid.volatility.volatility_std.toFixed(3)}</span>
                            <span>方向転換: {vid.volatility.direction_changes}回</span>
                            <span>振幅: {vid.volatility.max_amplitude.toFixed(3)}</span>
                          </div>
                        </div>
                        {/* Mini emotion timeline bar */}
                        <div className="flex gap-0.5 items-end h-12">
                          {vid.emotion_segments.map((seg, si) => {
                            const score = seg.emotion_score;
                            const height = Math.max(Math.abs(score) * 100, 4);
                            const bgColor = score > 0 ? "bg-green-400" : score < 0 ? "bg-red-400" : "bg-gray-300";
                            const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
                            return (
                              <div
                                key={si}
                                className={`flex-1 rounded-t ${bgColor} transition-all`}
                                style={{ height: `${height}%`, minWidth: 2, maxWidth: 16 }}
                                title={`${fmtT(seg.start_time)}-${fmtT(seg.end_time)}: ${score > 0 ? "+" : ""}${score.toFixed(2)}`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>開始</span>
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />ポジティブ</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" />ネガティブ</span>
                          </div>
                          <span>終了</span>
                        </div>
                        {/* Persuasion techniques detected */}
                        {vid.persuasion_techniques.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {vid.persuasion_techniques.map((pt, pi) => (
                              <span key={pi} className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-800">
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

              {/* Section 1: Emotion Volatility Analysis */}
              {psychResult.emotion_volatility_analysis && psychResult.emotion_volatility_analysis.videos && psychResult.emotion_volatility_analysis.videos.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-2 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>💓</span> 感情ボラティリティ分析
                  </h4>
                  <p className="mb-4 text-sm text-gray-600">{psychResult.emotion_volatility_analysis.summary}</p>
                  <div className="space-y-4">
                    {psychResult.emotion_volatility_analysis.videos.map((vid, i) => (
                      <div key={i} className="rounded-lg border border-red-100 bg-red-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold text-red-900">{vid.video_name}</h5>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-600">ボラティリティスコア</span>
                            <div className="w-24 h-2.5 bg-red-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 rounded-full transition-all"
                                style={{ width: `${Math.min(vid.volatility_score * 10, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold text-red-700">{vid.volatility_score}/10</span>
                          </div>
                        </div>
                        <p className="text-sm text-red-800 mb-2">{vid.emotion_arc}</p>

                        {/* Peak moments */}
                        {vid.peak_moments && vid.peak_moments.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-red-700 mb-1.5">感情のピークモーメント:</p>
                            <div className="space-y-1.5">
                              {vid.peak_moments.map((pm, j) => (
                                <div key={j} className="flex items-start gap-2 bg-white/60 rounded px-2.5 py-1.5">
                                  <span className="shrink-0 inline-block rounded bg-red-200 px-1.5 py-0.5 text-xs font-mono text-red-800">
                                    {pm.timestamp_range}
                                  </span>
                                  <span className="shrink-0 text-xs font-semibold text-red-700">{pm.emotion}</span>
                                  <span className="text-xs text-red-600">{pm.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Emotional hooks */}
                        {vid.emotional_hooks && vid.emotional_hooks.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-red-700 mb-1">感情的フック:</p>
                            <ul className="space-y-1">
                              {vid.emotional_hooks.map((hook, j) => (
                                <li key={j} className="text-xs text-red-700 bg-white/40 rounded px-2 py-1">
                                  {hook}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="mt-3 text-xs text-red-600 italic border-t border-red-100 pt-2">{vid.evaluation}</p>
                      </div>
                    ))}
                  </div>
                  {/* Best practices */}
                  {psychResult.emotion_volatility_analysis.best_practices && psychResult.emotion_volatility_analysis.best_practices.length > 0 && (
                    <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-4">
                      <p className="text-xs font-semibold text-red-800 mb-2">ベストプラクティス:</p>
                      <ul className="space-y-1">
                        {psychResult.emotion_volatility_analysis.best_practices.map((bp, i) => (
                          <li key={i} className="text-xs text-red-700 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-red-400" />
                            {bp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Section 2: Storytelling Analysis */}
              {psychResult.storytelling_analysis && psychResult.storytelling_analysis.videos && psychResult.storytelling_analysis.videos.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-2 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>📖</span> ストーリーテリング・実用性分析
                  </h4>
                  <p className="mb-4 text-sm text-gray-600">{psychResult.storytelling_analysis.summary}</p>
                  <div className="space-y-4">
                    {psychResult.storytelling_analysis.videos.map((vid, i) => (
                      <div key={i} className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                        <h5 className="font-semibold text-indigo-900 mb-3">{vid.video_name}</h5>

                        {/* Score gauges */}
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          {[
                            { label: "実用性", score: vid.practical_value_score, color: "indigo" },
                            { label: "記憶性", score: vid.memorability_score, color: "blue" },
                            { label: "共有性", score: vid.shareability_score, color: "violet" },
                          ].map((g, gi) => (
                            <div key={gi} className="text-center">
                              <div className="relative inline-flex items-center justify-center w-14 h-14">
                                <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 56 56">
                                  <circle cx="28" cy="28" r="24" fill="none" stroke="#e0e7ff" strokeWidth="4" />
                                  <circle
                                    cx="28" cy="28" r="24" fill="none"
                                    stroke={g.color === "indigo" ? "#6366f1" : g.color === "blue" ? "#3b82f6" : "#8b5cf6"}
                                    strokeWidth="4" strokeLinecap="round"
                                    strokeDasharray={`${(g.score / 10) * 150.8} 150.8`}
                                  />
                                </svg>
                                <span className="absolute text-sm font-bold text-indigo-800">{g.score}</span>
                              </div>
                              <p className="mt-1 text-xs text-indigo-600">{g.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Story structure */}
                        <div className="mb-2 rounded bg-white/50 px-3 py-2">
                          <p className="text-xs font-medium text-indigo-700">物語構造:</p>
                          <p className="text-sm text-indigo-800">{vid.story_structure}</p>
                        </div>

                        {/* Narrative elements */}
                        {vid.narrative_elements && vid.narrative_elements.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-indigo-700 mb-1.5">物語要素:</p>
                            <div className="space-y-1.5">
                              {vid.narrative_elements.map((ne, j) => (
                                <div key={j} className="bg-white/50 rounded px-2.5 py-1.5">
                                  <span className="text-xs font-semibold text-indigo-800">{ne.element}</span>
                                  <span className="text-xs text-indigo-700"> - {ne.description}</span>
                                  {ne.example && <span className="text-xs text-indigo-500 italic block mt-0.5">例: 「{ne.example}」</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Hooks */}
                        {vid.hooks && vid.hooks.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {vid.hooks.map((h, j) => (
                              <span key={j} className="inline-block rounded-full bg-indigo-200 px-2.5 py-0.5 text-xs text-indigo-800">
                                {h}
                              </span>
                            ))}
                          </div>
                        )}

                        <p className="mt-3 text-xs text-indigo-600 italic border-t border-indigo-100 pt-2">{vid.evaluation}</p>
                      </div>
                    ))}
                  </div>
                  {/* Story patterns */}
                  {psychResult.storytelling_analysis.story_patterns && psychResult.storytelling_analysis.story_patterns.length > 0 && (
                    <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 p-4">
                      <p className="text-xs font-semibold text-indigo-800 mb-2">効果的なストーリーパターン:</p>
                      <ul className="space-y-1">
                        {psychResult.storytelling_analysis.story_patterns.map((sp, i) => (
                          <li key={i} className="text-xs text-indigo-700 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            {sp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Section 3: Conversion Pipeline Analysis */}
              {psychResult.conversion_pipeline_analysis && psychResult.conversion_pipeline_analysis.videos && psychResult.conversion_pipeline_analysis.videos.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-2 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>🎯</span> コンバージョン導線・説得力分析
                  </h4>
                  <p className="mb-4 text-sm text-gray-600">{psychResult.conversion_pipeline_analysis.summary}</p>
                  <div className="space-y-4">
                    {psychResult.conversion_pipeline_analysis.videos.map((vid, i) => (
                      <div key={i} className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-semibold text-emerald-900">{vid.video_name}</h5>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-600">説得力スコア</span>
                            <div className="w-24 h-2.5 bg-emerald-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.min(vid.persuasion_score * 10, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold text-emerald-700">{vid.persuasion_score}/10</span>
                          </div>
                        </div>

                        {/* CTA moments */}
                        {vid.cta_analysis && vid.cta_analysis.cta_moments && vid.cta_analysis.cta_moments.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-emerald-700 mb-1.5">CTAモーメント:</p>
                            <div className="space-y-1.5">
                              {vid.cta_analysis.cta_moments.map((cta, j) => (
                                <div key={j} className="flex items-start gap-2 bg-white/60 rounded px-2.5 py-1.5">
                                  <span className="shrink-0 inline-block rounded bg-emerald-200 px-1.5 py-0.5 text-xs font-mono text-emerald-800">
                                    {cta.timestamp_range}
                                  </span>
                                  <span className="shrink-0 inline-block rounded-full bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                    {cta.technique}
                                  </span>
                                  <span className="text-xs text-emerald-700 flex-1">「{cta.text}」</span>
                                  <span className={`shrink-0 text-xs font-medium ${
                                    cta.effectiveness === "高" ? "text-green-700" :
                                    cta.effectiveness === "中" ? "text-yellow-700" : "text-gray-500"
                                  }`}>
                                    効果: {cta.effectiveness}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Flow naturalness */}
                        {vid.cta_analysis && vid.cta_analysis.flow_naturalness && (
                          <div className="mt-2 rounded bg-white/50 px-3 py-2">
                            <p className="text-xs font-medium text-emerald-700">ストーリー→CTA自然さ:</p>
                            <p className="text-sm text-emerald-800">{vid.cta_analysis.flow_naturalness}</p>
                          </div>
                        )}

                        {/* Persuasion techniques */}
                        {vid.persuasion_techniques && vid.persuasion_techniques.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-emerald-700 mb-1.5">使用されている説得技法:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                              {vid.persuasion_techniques.map((pt, j) => (
                                <div key={j} className="bg-white/50 rounded px-2.5 py-1.5">
                                  <span className="text-xs font-semibold text-emerald-800">{pt.technique}</span>
                                  <span className="text-xs text-emerald-700"> - {pt.description}</span>
                                  {pt.example && <span className="text-xs text-emerald-500 italic block mt-0.5">例: 「{pt.example}」</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="mt-3 text-xs text-emerald-600 italic border-t border-emerald-100 pt-2">{vid.evaluation}</p>
                      </div>
                    ))}
                  </div>
                  {/* Optimization suggestions */}
                  {psychResult.conversion_pipeline_analysis.optimization_suggestions && psychResult.conversion_pipeline_analysis.optimization_suggestions.length > 0 && (
                    <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                      <p className="text-xs font-semibold text-emerald-800 mb-2">CTA最適化の提案:</p>
                      <ul className="space-y-1">
                        {psychResult.conversion_pipeline_analysis.optimization_suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-emerald-700 flex items-start gap-2">
                            <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Section 4: Metrics Correlation */}
              {psychResult.metrics_correlation && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>📈</span> 評価指標との相関分析
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { label: "視聴完了率", factors: psychResult.metrics_correlation.completion_rate_factors, icon: "👁️", color: "blue" },
                      { label: "クリック率 (CTR)", factors: psychResult.metrics_correlation.ctr_factors, icon: "👆", color: "purple" },
                      { label: "登録率 (CVR)", factors: psychResult.metrics_correlation.conversion_rate_factors, icon: "🎯", color: "green" },
                      { label: "エンゲージメント率", factors: psychResult.metrics_correlation.engagement_factors, icon: "💬", color: "orange" },
                    ].map((metric, mi) => (
                      <div key={mi} className="rounded-lg border border-gray-200 p-4">
                        <h5 className="flex items-center gap-2 font-semibold text-gray-900 text-sm mb-2">
                          <span>{metric.icon}</span> {metric.label}
                        </h5>
                        {metric.factors && metric.factors.length > 0 ? (
                          <ul className="space-y-1">
                            {metric.factors.map((f, fi) => (
                              <li key={fi} className="text-xs text-gray-600 flex items-start gap-2">
                                <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                                  metric.color === "blue" ? "bg-blue-400" :
                                  metric.color === "purple" ? "bg-purple-400" :
                                  metric.color === "green" ? "bg-green-400" : "bg-orange-400"
                                }`} />
                                {f}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-gray-400">データなし</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 5: Cross-video Insights */}
              {psychResult.cross_video_insights && psychResult.cross_video_insights.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>💡</span> 動画横断インサイト
                  </h4>
                  <div className="space-y-3">
                    {psychResult.cross_video_insights.map((ci, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <span className={`mt-0.5 shrink-0 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ci.confidence === "high" ? "bg-green-100 text-green-800 border border-green-200" :
                          ci.confidence === "medium" ? "bg-yellow-100 text-yellow-800 border border-yellow-200" :
                          "bg-red-100 text-red-800 border border-red-200"
                        }`}>
                          {ci.confidence === "high" ? "高" : ci.confidence === "medium" ? "中" : "低"}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm text-gray-700">{ci.insight}</p>
                          {ci.actionable && (
                            <p className="mt-1 text-xs text-blue-600 font-medium">
                              アクション: {ci.actionable}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section 6: Recommendations */}
              {psychResult.recommendations && psychResult.recommendations.length > 0 && (
                <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                  <h4 className="mb-4 text-base font-semibold text-gray-900 flex items-center gap-2">
                    <span>🚀</span> 改善提案
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {psychResult.recommendations.map((rec, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{rec.category}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            rec.priority === "high" ? "bg-red-100 text-red-800 border border-red-200" :
                            rec.priority === "medium" ? "bg-yellow-100 text-yellow-800 border border-yellow-200" :
                            "bg-gray-100 text-gray-800 border border-gray-200"
                          }`}>
                            優先度: {rec.priority === "high" ? "高" : rec.priority === "medium" ? "中" : "低"}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">{rec.recommendation}</p>
                        {rec.expected_impact && (
                          <p className="mt-2 text-xs text-blue-600 italic">
                            期待効果: {rec.expected_impact}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ══════════════ Tab 5: テキスト検索 ══════════════ */}
      {activeTab === "search" && (
        <div className="space-y-6">
          {/* Search input */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!searchQuery.trim()) return;
              try {
                setSearchLoading(true);
                setError(null);
                const data = await searchTranscriptions(searchQuery.trim());
                setSearchResults(data.results);
                setSearchTotal(data.total);
              } catch (err) {
                setError("検索に失敗しました。");
                console.error(err);
              } finally {
                setSearchLoading(false);
              }
            }}
            className="flex items-center gap-3"
          >
            <div className="relative flex-1">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="書き起こしテキストを横断検索..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={searchLoading || !searchQuery.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {searchLoading ? (
                <>
                  <Spinner />
                  検索中...
                </>
              ) : (
                "検索"
              )}
            </button>
          </form>

          {/* Results */}
          {searchLoading ? (
            <PageSpinner text="検索中..." />
          ) : searchResults.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {searchTotal}件のセグメントが見つかりました
              </p>
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 font-medium text-gray-500">動画</th>
                        <th className="px-6 py-3 font-medium text-gray-500">時間</th>
                        <th className="px-6 py-3 font-medium text-gray-500">テキスト</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {searchResults.map((r) => {
                        const fmtTime = (s: number) => {
                          const mm = Math.floor(s / 60);
                          const ss = Math.floor(s % 60);
                          return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
                        };
                        return (
                          <tr key={r.segment_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3">
                              <a
                                href={`/videos/${r.video_id}`}
                                className="text-blue-600 hover:underline font-medium"
                              >
                                {r.video_filename}
                              </a>
                            </td>
                            <td className="px-6 py-3 text-gray-500 font-mono text-xs whitespace-nowrap">
                              {fmtTime(r.start_time)} - {fmtTime(r.end_time)}
                            </td>
                            <td className="px-6 py-3 text-gray-700">{r.text}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : searchTotal === 0 && !searchLoading && searchQuery ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">一致するテキストが見つかりませんでした。</p>
            </div>
          ) : null}
        </div>
      )}

      {/* ══════════════ Tab 5: 書き起こし一覧 ══════════════ */}
      {activeTab === "transcripts" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">全書き起こし一覧</h3>
              <p className="text-sm text-gray-500">
                全ての書き起こし済み動画のテキストを時間毎に閲覧できます
              </p>
            </div>
            <button
              onClick={fetchAllTranscripts}
              disabled={transcriptsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {transcriptsLoading ? (
                <>
                  <Spinner />
                  読み込み中...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  更新
                </>
              )}
            </button>
          </div>

          {transcriptsLoading ? (
            <PageSpinner text="書き起こしデータを読み込み中..." />
          ) : allTranscripts.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">書き起こし済みの動画がありません。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {allTranscripts.map((transcript) => {
                const isExpanded = expandedVideoId === transcript.video_id;
                const formatTime = (s: number) => {
                  const mm = Math.floor(s / 60);
                  const ss = Math.floor(s % 60);
                  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
                };

                return (
                  <div
                    key={transcript.video_id}
                    className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden"
                  >
                    {/* Video header */}
                    <button
                      onClick={() => setExpandedVideoId(isExpanded ? null : transcript.video_id)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100">
                          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900">{transcript.video_filename}</h4>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-500">
                              {transcript.segments.length}セグメント
                            </span>
                            {transcript.duration_seconds && (
                              <span className="text-xs text-gray-500">
                                {formatTime(transcript.duration_seconds)}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {transcript.language}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <a
                          href={`/videos/${transcript.video_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        >
                          詳細を見る
                        </a>
                        <svg
                          className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        {/* Full text summary */}
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            全文テキスト
                          </h5>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {transcript.full_text}
                          </p>
                        </div>

                        {/* Segments timeline */}
                        <div className="px-6 py-4">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
                            時間毎のセグメント
                          </h5>
                          <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {transcript.segments.map((segment, idx) => (
                              <div
                                key={segment.id}
                                className="flex gap-4 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                              >
                                {/* Timeline badge */}
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                                    {idx + 1}
                                  </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      {formatTime(segment.start_time)}
                                    </span>
                                    <span className="text-xs text-gray-400">→</span>
                                    <span className="text-xs text-gray-500">{formatTime(segment.end_time)}</span>
                                    <span className="text-xs text-gray-400">
                                      ({Math.round(segment.end_time - segment.start_time)}秒)
                                    </span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">
                                    {segment.text}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: 履歴 */}
      {activeTab === "history" && (
        <div className="space-y-6">
          {historyLoading ? (
            <PageSpinner text="履歴を読み込み中..." />
          ) : historyRecords.length === 0 ? (
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-8 text-center">
              <p className="text-gray-500">分析履歴がありません。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* History list */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 font-medium text-gray-500">ID</th>
                        <th className="px-6 py-3 font-medium text-gray-500">種類</th>
                        <th className="px-6 py-3 font-medium text-gray-500">スコープ</th>
                        <th className="px-6 py-3 font-medium text-gray-500">モデル</th>
                        <th className="px-6 py-3 font-medium text-gray-500">実行日時</th>
                        <th className="px-6 py-3 font-medium text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {historyRecords.map((rec) => {
                        const typeLabel: Record<string, string> = {
                          keyword_frequency: "キーワード",
                          correlation: "相関分析",
                          ai_recommendation: "AI分析",
                          ranking_comparison: "ランキング比較",
                          psychological_content: "心理分析",
                        };
                        return (
                          <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 text-gray-400">#{rec.id}</td>
                            <td className="px-6 py-3">
                              <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                {typeLabel[rec.analysis_type] ?? rec.analysis_type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-700 text-xs">
                              {rec.scope === "cross_video" ? "全体" : `動画 #${rec.video_id}`}
                            </td>
                            <td className="px-6 py-3 text-gray-500 text-xs font-mono">
                              {rec.gemini_model_used ?? "---"}
                            </td>
                            <td className="px-6 py-3 text-gray-700 text-xs">
                              {formatTimestamp(rec.created_at)}
                            </td>
                            <td className="px-6 py-3">
                              <button
                                onClick={() => setHistoryDetail(historyDetail?.id === rec.id ? null : rec)}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                {historyDetail?.id === rec.id ? "閉じる" : "詳細"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detail panel */}
              {historyDetail && (
                <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-900">
                      #{historyDetail.id} の詳細結果
                    </h4>
                    <button
                      onClick={() => setHistoryDetail(null)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="px-6 py-4">
                    <pre className="max-h-96 overflow-auto rounded-lg bg-gray-50 p-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {JSON.stringify(historyDetail.result, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
