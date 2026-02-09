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
  getAnalysisResults,
} from "../api/analysis";
import { getManagedTags } from "../api/settings";
import { getAllTranscriptions, type FullTranscription } from "../api/transcriptions";
import { exportKeywordAnalysisCSV, exportCorrelationAnalysisCSV } from "../utils/csv";
import IntegratedAITab from "../components/analysis/IntegratedAITab";
import type { KeywordItem, CorrelationItem } from "../types";

type TabKey = "keyword" | "correlation" | "ai_integrated" | "transcripts" | "history";

interface TabDef {
  key: TabKey;
  label: string;
}

const TABS: TabDef[] = [
  { key: "keyword", label: "キーワード分析" },
  { key: "correlation", label: "相関分析" },
  { key: "ai_integrated", label: "AI総合分析" },
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
  const [keywordPlatform, setKeywordPlatform] = useState("");

  // --- Correlation state ---
  const [correlations, setCorrelations] = useState<CorrelationItem[]>([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationRunning, setCorrelationRunning] = useState(false);

  // --- History state ---
  const [historyRecords, setHistoryRecords] = useState<AnalysisRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<AnalysisRecord | null>(null);

  // --- Transcripts state ---
  const [allTranscripts, setAllTranscripts] = useState<FullTranscription[]>([]);
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [expandedVideoId, setExpandedVideoId] = useState<number | null>(null);

  // --- Managed tags (for keyword platform filter) ---
  const [managedTags, setManagedTags] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Elapsed time counter
  const [runningElapsed, setRunningElapsed] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startElapsedTimer = () => {
    setRunningElapsed(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setRunningElapsed((e) => e + 1), 1000);
  };
  const stopElapsedTimer = () => {
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
  };
  useEffect(() => {
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, []);

  // Timestamps
  const [keywordTimestamp, setKeywordTimestamp] = useState<string | null>(null);
  const [correlationTimestamp, setCorrelationTimestamp] = useState<string | null>(null);

  // Load managed tags
  useEffect(() => {
    getManagedTags().then(setManagedTags).catch(() => {});
  }, []);

  // ─── Fetch functions ───────────────────────────────────────
  const fetchKeywordResults = async () => {
    try {
      setKeywordLoading(true);
      const data = await getAnalysisResults("keyword_frequency");
      if (data && data.length > 0) {
        const latest = data[0];
        setKeywords(latest.result?.keywords ?? []);
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
        setCorrelations(latest.result?.correlations ?? []);
        setCorrelationTimestamp(latest.created_at);
      }
    } catch (err) {
      console.error("相関分析結果の取得に失敗:", err);
    } finally {
      setCorrelationLoading(false);
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

  // Lazy-load tabs
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set());
  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    setLoadedTabs((prev) => new Set(prev).add(activeTab));
    switch (activeTab) {
      case "keyword": fetchKeywordResults(); break;
      case "correlation": fetchCorrelationResults(); break;
      case "transcripts": fetchAllTranscripts(); break;
      case "history": fetchHistory(); break;
    }
  }, [activeTab]);

  // ─── Handlers ──────────────────────────────────────────────
  const handleRunKeyword = async () => {
    try {
      setKeywordRunning(true);
      setError(null);
      startElapsedTimer();
      await runKeywordAnalysis(keywordPlatform || undefined);
      await fetchKeywordResults();
    } catch (err: any) {
      setError(err.message ?? "キーワード分析の実行に失敗しました。");
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

  // ─── Helpers ───────────────────────────────────────────────
  const sortedKeywords = [...keywords].sort((a, b) => b.count - a.count);
  const top50Keywords = sortedKeywords.slice(0, 50);
  const top20ChartData = sortedKeywords.slice(0, 20).map((kw) => ({ keyword: kw.keyword, count: kw.count }));

  const getEffectBadge = (score: number) => {
    if (score > 1.5) return { label: "高効果", className: "bg-green-100 text-green-800 border border-green-200" };
    if (score >= 1.0) return { label: "中効果", className: "bg-yellow-100 text-yellow-800 border border-yellow-200" };
    return { label: "低効果", className: "bg-red-100 text-red-800 border border-red-200" };
  };

  const scatterData = correlations.map((c) => ({
    keyword: c.keyword, effectiveness_score: c.effectiveness_score,
    avg_conversion_with: c.avg_conversion_with, video_count: c.video_count,
  }));

  const handleExportKeywordsCsv = () => exportKeywordAnalysisCSV(top50Keywords);
  const handleExportCorrelationCsv = () => exportCorrelationAnalysisCSV(correlations);

  const formatTimestamp = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const TimestampBadge = ({ ts }: { ts: string | null }) => {
    if (!ts) return null;
    return <span className="text-xs text-gray-400">最終実行: {formatTimestamp(ts)}</span>;
  };

  const Spinner = () => (<div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />);
  const PageSpinner = ({ text }: { text: string }) => (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        <p className="mt-3 text-gray-500">{text}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">詳細分析</h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
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

      {/* ══════════════ Tab: キーワード分析 ══════════════ */}
      {activeTab === "keyword" && (
        <div className="space-y-6">
          {/* Platform filter + Run button + CSV export */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">媒体:</span>
              <select
                value={keywordPlatform}
                onChange={(e) => setKeywordPlatform(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">全体</option>
                {managedTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
            <button
              onClick={handleRunKeyword}
              disabled={keywordRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {keywordRunning ? (
                <><Spinner /> 分析実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}</>
              ) : (
                keywordPlatform ? `${keywordPlatform}のキーワード分析を実行` : "キーワード分析を実行"
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
              <p className="text-gray-500">キーワード分析結果がありません。上のボタンから分析を実行してください。</p>
            </div>
          ) : (
            <>
              {/* Bar chart */}
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">トップ20キーワード</h3>
                <div style={{ width: "100%", minWidth: 300, height: 450, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
                    <BarChart data={top20ChartData} margin={{ top: 10, right: 30, left: 10, bottom: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="keyword" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 12 }} height={80} />
                      <YAxis allowDecimals={false} />
                      <Tooltip formatter={(value) => [`${value}回`, "出現回数"]} contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Results table */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">キーワード一覧（上位50件）</h3>
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
                          <td className="px-6 py-3 text-right text-gray-700">{Object.keys(kw.video_counts).length}</td>
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

      {/* ══════════════ Tab: 相関分析 ══════════════ */}
      {activeTab === "correlation" && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button
              onClick={handleRunCorrelation}
              disabled={correlationRunning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {correlationRunning ? (
                <><Spinner /> 分析実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}</>
              ) : "相関分析を実行"}
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
              <p className="text-gray-500">相関分析結果がありません。上のボタンから分析を実行してください。</p>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">効果スコア vs コンバージョン率</h3>
                <div style={{ width: "100%", minWidth: 300, height: 400, minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={300} minHeight={300}>
                    <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="effectiveness_score" type="number" name="効果スコア" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="avg_conversion_with" type="number" name="平均CV（キーワードあり）" tick={{ fontSize: 12 }} />
                      <ZAxis range={[60, 200]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-md text-sm">
                            <p className="font-semibold text-gray-900">{d.keyword}</p>
                            <p className="text-gray-600">効果スコア: {d.effectiveness_score.toFixed(2)}</p>
                            <p className="text-gray-600">平均CV（あり）: {d.avg_conversion_with.toFixed(2)}</p>
                            <p className="text-gray-600">動画数: {d.video_count}</p>
                          </div>
                        );
                      }} />
                      <Scatter data={scatterData} fill="#3b82f6" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900">相関分析結果</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-6 py-3 font-medium text-gray-500">キーワード</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">あり平均CV</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">なし平均CV</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-center">効果スコア</th>
                        <th className="px-6 py-3 font-medium text-gray-500 text-right">動画数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {correlations.map((c) => {
                        const badge = getEffectBadge(c.effectiveness_score);
                        return (
                          <tr key={c.keyword} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 font-medium text-gray-900">{c.keyword}</td>
                            <td className="px-6 py-3 text-right text-gray-700">{c.avg_conversion_with.toFixed(2)}</td>
                            <td className="px-6 py-3 text-right text-gray-700">{c.avg_conversion_without.toFixed(2)}</td>
                            <td className="px-6 py-3 text-center">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
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

      {/* ══════════════ Tab: AI総合分析 ══════════════ */}
      {activeTab === "ai_integrated" && <IntegratedAITab />}

      {/* ══════════════ Tab: 書き起こし一覧 ══════════════ */}
      {activeTab === "transcripts" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">全書き起こし一覧</h3>
              <p className="text-sm text-gray-500">全ての書き起こし済み動画のテキストを時間毎に閲覧できます</p>
            </div>
            <button
              onClick={fetchAllTranscripts}
              disabled={transcriptsLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-60 transition-colors"
            >
              {transcriptsLoading ? "読み込み中..." : "更新"}
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
                const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
                return (
                  <div key={transcript.video_id} className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
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
                            <span className="text-xs text-gray-500">{transcript.segments.length}セグメント</span>
                            {transcript.duration_seconds && <span className="text-xs text-gray-500">{formatTime(transcript.duration_seconds)}</span>}
                            <span className="text-xs text-gray-400">{transcript.language}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <a href={`/videos/${transcript.video_id}`} onClick={(e) => e.stopPropagation()} className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors">詳細を見る</a>
                        <svg className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">全文テキスト</h5>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">{transcript.full_text}</p>
                        </div>
                        <div className="px-6 py-4">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">時間毎のセグメント</h5>
                          <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {transcript.segments.map((segment, idx) => (
                              <div key={segment.id} className="flex gap-4 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{idx + 1}</div>
                                </div>
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
                                    <span className="text-xs text-gray-400">({Math.round(segment.end_time - segment.start_time)}秒)</span>
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed">{segment.text}</p>
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

      {/* ══════════════ Tab: 履歴 ══════════════ */}
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
                          keyword_frequency: "キーワード", correlation: "相関分析",
                          ai_recommendation: "AI分析", ranking_comparison: "ランキング比較",
                          psychological_content: "心理分析", marketing_report: "マーケティングレポート",
                          content_suggestion: "台本提案", platform_analysis: "媒体分析",
                          ab_deep_comparison: "AI深掘り比較", ranking_platform_insight: "ランキングインサイト",
                        };
                        return (
                          <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-3 text-gray-400">#{rec.id}</td>
                            <td className="px-6 py-3">
                              <span className="inline-block rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                                {typeLabel[rec.analysis_type] ?? rec.analysis_type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-gray-700 text-xs">{rec.scope === "cross_video" ? "全体" : rec.scope}</td>
                            <td className="px-6 py-3 text-gray-500 text-xs font-mono">{rec.gemini_model_used ?? "---"}</td>
                            <td className="px-6 py-3 text-gray-700 text-xs">{formatTimestamp(rec.created_at)}</td>
                            <td className="px-6 py-3">
                              <button onClick={() => setHistoryDetail(historyDetail?.id === rec.id ? null : rec)} className="text-xs text-blue-600 hover:underline">
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

              {historyDetail && (
                <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-900">#{historyDetail.id} の詳細結果</h4>
                    <button onClick={() => setHistoryDetail(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
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
