import { useCallback, useEffect, useRef, useState } from "react";
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
  getAnalysisResults,
  runCorrelationAnalysis,
  runKeywordAnalysis,
} from "../api/analysis";
import { getManagedTags } from "../api/settings";
import IntegratedAITab from "../components/analysis/IntegratedAITab";
import { exportCorrelationAnalysisCSV, exportKeywordAnalysisCSV } from "../utils/csv";
import { getErrorMessage } from "../utils/errors";
import type { CorrelationItem, KeywordItem } from "../types";

type TabKey = "keyword" | "correlation" | "ai_integrated";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "keyword", label: "キーワード分析" },
  { key: "correlation", label: "相関分析" },
  { key: "ai_integrated", label: "AI統合分析" },
];

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TimestampBadge({ value }: { value: string | null }) {
  if (!value) return null;
  return <span className="text-xs text-gray-400">最終実行: {formatTimestamp(value)}</span>;
}

function Spinner() {
  return <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />;
}

function PageSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        <p className="mt-3 text-gray-500">{text}</p>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("keyword");
  const [loadedTabs, setLoadedTabs] = useState<Set<TabKey>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [keywordLoading, setKeywordLoading] = useState(false);
  const [keywordRunning, setKeywordRunning] = useState(false);
  const [keywordPlatform, setKeywordPlatform] = useState("");
  const [keywordTimestamp, setKeywordTimestamp] = useState<string | null>(null);

  const [correlations, setCorrelations] = useState<CorrelationItem[]>([]);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationRunning, setCorrelationRunning] = useState(false);
  const [correlationTimestamp, setCorrelationTimestamp] = useState<string | null>(null);

  const [managedTags, setManagedTags] = useState<string[]>([]);
  const [runningElapsed, setRunningElapsed] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startElapsedTimer = useCallback(() => {
    setRunningElapsed(0);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    elapsedTimerRef.current = setInterval(() => setRunningElapsed((value) => value + 1), 1000);
  }, []);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    getManagedTags().then(setManagedTags).catch(() => { });
  }, []);

  const fetchKeywordResults = useCallback(async () => {
    try {
      setKeywordLoading(true);
      const data = await getAnalysisResults("keyword_frequency");
      if (data.length > 0) {
        const latest = data[0];
        const result = latest.result as { keywords?: KeywordItem[] };
        setKeywords(result.keywords ?? []);
        setKeywordTimestamp(latest.created_at);
      }
    } catch (fetchError) {
      console.error("Failed to fetch keyword analysis", fetchError);
    } finally {
      setKeywordLoading(false);
    }
  }, []);

  const fetchCorrelationResults = useCallback(async () => {
    try {
      setCorrelationLoading(true);
      const data = await getAnalysisResults("correlation");
      if (data.length > 0) {
        const latest = data[0];
        const result = latest.result as { correlations?: CorrelationItem[] };
        setCorrelations(result.correlations ?? []);
        setCorrelationTimestamp(latest.created_at);
      }
    } catch (fetchError) {
      console.error("Failed to fetch correlation analysis", fetchError);
    } finally {
      setCorrelationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    setLoadedTabs((prev) => new Set(prev).add(activeTab));
    switch (activeTab) {
      case "keyword": fetchKeywordResults(); break;
      case "correlation": fetchCorrelationResults(); break;
      default: break;
    }
  }, [activeTab, fetchCorrelationResults, fetchKeywordResults, loadedTabs]);

  const handleRunKeyword = async () => {
    try {
      setKeywordRunning(true);
      setError(null);
      startElapsedTimer();
      await runKeywordAnalysis(keywordPlatform || undefined);
      await fetchKeywordResults();
    } catch (runError) {
      setError(getErrorMessage(runError, "キーワード分析の実行に失敗しました。"));
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
    } catch (runError) {
      setError(getErrorMessage(runError, "相関分析の実行に失敗しました。"));
    } finally {
      setCorrelationRunning(false);
      stopElapsedTimer();
    }
  };

  const sortedKeywords = [...keywords].sort((a, b) => b.count - a.count);
  const topKeywords = sortedKeywords.slice(0, 50);
  const keywordChartData = sortedKeywords.slice(0, 20).map((item) => ({
    keyword: item.keyword,
    count: item.count,
  }));

  const scatterData = correlations.map((item) => ({
    keyword: item.keyword,
    effectiveness_score: item.effectiveness_score,
    avg_conversion_with: item.avg_conversion_with,
    video_count: item.video_count,
  }));

  const renderKeywordTab = () => (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">タグ</span>
          <select
            value={keywordPlatform}
            onChange={(event) => setKeywordPlatform(event.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">すべて</option>
            {managedTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunKeyword}
          disabled={keywordRunning}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {keywordRunning ? (
            <><Spinner />実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}</>
          ) : "キーワード分析を実行"}
        </button>

        {topKeywords.length > 0 && (
          <button
            onClick={() => exportKeywordAnalysisCSV(topKeywords)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            CSV出力
          </button>
        )}
        <TimestampBadge value={keywordTimestamp} />
      </div>

      {keywordLoading ? (
        <PageSpinner text="キーワード分析を読み込み中..." />
      ) : topKeywords.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          キーワード分析の結果がありません。
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">頻出キーワード</h3>
            <div style={{ width: "100%", minWidth: 300, height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={keywordChartData} margin={{ top: 10, right: 30, left: 10, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="keyword" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 12 }} height={80} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">上位50件</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500">#</th>
                    <th className="px-6 py-3 font-medium text-gray-500">キーワード</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">出現数</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">対象動画数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topKeywords.map((item, index) => (
                    <tr key={item.keyword} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-gray-400">{index + 1}</td>
                      <td className="px-6 py-3 font-medium text-gray-900">{item.keyword}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{item.count}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{Object.keys(item.video_counts).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderCorrelationTab = () => (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={handleRunCorrelation}
          disabled={correlationRunning}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {correlationRunning ? (
            <><Spinner />実行中...{runningElapsed > 0 && ` (${runningElapsed}秒)`}</>
          ) : "相関分析を実行"}
        </button>

        {correlations.length > 0 && (
          <button
            onClick={() => exportCorrelationAnalysisCSV(correlations)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            CSV出力
          </button>
        )}
        <TimestampBadge value={correlationTimestamp} />
      </div>

      {correlationLoading ? (
        <PageSpinner text="相関分析を読み込み中..." />
      ) : correlations.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
          相関分析の結果がありません。
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">効果スコア分布</h3>
            <div style={{ width: "100%", minWidth: 300, height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="effectiveness_score" type="number" name="effectiveness" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="avg_conversion_with" type="number" name="conversion" tick={{ fontSize: 12 }} />
                  <ZAxis range={[60, 200]} />
                  <Tooltip />
                  <Scatter data={scatterData} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">相関分析結果</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-6 py-3 font-medium text-gray-500">キーワード</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">あり平均</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">なし平均</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">効果スコア</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-500">動画数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {correlations.map((item) => (
                    <tr key={item.keyword} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{item.keyword}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{item.avg_conversion_with.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{item.avg_conversion_without.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{item.effectiveness_score.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-gray-700">{item.video_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">分析</h2>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${activeTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "keyword" && renderKeywordTab()}
      {activeTab === "correlation" && renderCorrelationTab()}
      {activeTab === "ai_integrated" && <IntegratedAITab />}
    </div>
  );
}
