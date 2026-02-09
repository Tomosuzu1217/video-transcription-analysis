import { useState, useEffect, useCallback, Fragment } from "react";
import { getAnalysisHistory } from "../../api/analysis";
import type { AnalysisRecord } from "../../types";

const TYPE_LABELS: Record<string, string> = {
  keyword_frequency: "キーワード分析",
  correlation: "相関分析",
  ai_recommendation: "AI推奨",
  ranking_comparison: "ランキング比較",
  psychological_content: "心理分析",
  marketing_report: "マーケティングレポート",
  content_suggestion: "台本提案",
  platform_analysis: "媒体分析",
  ab_deep_comparison: "AI深掘り比較",
  ranking_platform_insight: "ランキングインサイト",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" })
    + " " + d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export default function AnalysisHistoryTab() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const perPage = 20;

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const { results, total: t } = await getAnalysisHistory(perPage, page * perPage);
      setRecords(results);
      setTotal(t);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const totalPages = Math.ceil(total / perPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          <p className="mt-2 text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-gray-100 p-12 text-center shadow-sm">
        <p className="text-sm text-gray-400">分析履歴がありません。各分析を実行すると自動的に記録されます。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500">日時</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">分析タイプ</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">モデル</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">スコープ</th>
              <th className="px-4 py-3 font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <Fragment key={rec.id}>
                <tr
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${expandedId === rec.id ? "bg-blue-50" : ""}`}
                  onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                >
                  <td className="px-4 py-3 text-gray-700 tabular-nums whitespace-nowrap">{formatDate(rec.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {TYPE_LABELS[rec.analysis_type] ?? rec.analysis_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{rec.gemini_model_used ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{rec.scope}</td>
                  <td className="px-4 py-3 text-right">
                    <svg
                      className={`h-4 w-4 text-gray-400 transition-transform inline-block ${expandedId === rec.id ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </td>
                </tr>
                {expandedId === rec.id && (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 bg-gray-50 border-b border-gray-200">
                      <div className="max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono bg-white rounded-lg border border-gray-200 p-4">
                          {JSON.stringify(rec.result_json, null, 2)}
                        </pre>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page <= 0}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages - 1}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
