import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  getAllAdPerformance,
  importAdPerformance,
  deleteAdPerformance,
  deleteAllAdPerformance,
} from "../api/adPerformance";
import type { AdPerformance, AdPerformanceImportRow } from "../types";

const COLUMN_MAP: Record<string, keyof AdPerformanceImportRow> = {
  "コード": "code",
  "媒体": "media",
  "順位": "rank",
  "消化金額": "spend",
  "LINE追加": "line_adds",
  "回答数": "answers",
  "回答率_pct": "answer_rate",
  "回答CPA": "answer_cpa",
  "顧客数": "customers",
  "成約数": "contracts",
  "売上": "revenue",
  "ROI_pct": "roi",
  "事業貢献スコア": "score",
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function parseExcel(buffer: ArrayBuffer): { rows: AdPerformanceImportRow[]; errors: string[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames.find((n) => n === "動画ランキング") ?? wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ["シートが見つかりません"] };

  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (raw.length < 2) return { rows: [], errors: ["データ行がありません"] };

  const headers = (raw[0] as unknown[]).map((h) => String(h ?? "").trim());
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => { if (h) colIndex[h] = i; });

  const rows: AdPerformanceImportRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as unknown[];
    const get = (header: string) => {
      const idx = colIndex[header];
      return idx !== undefined ? row[idx] : undefined;
    };

    const code = String(get("コード") ?? "").trim();
    if (!code) continue;

    const media = String(get("媒体") ?? "").trim();
    if (!media) {
      errors.push(`行${i + 1}: 媒体が空です（コード: ${code}）`);
      continue;
    }

    rows.push({
      code,
      media,
      rank: toNum(get("順位")),
      spend: toNum(get("消化金額")),
      line_adds: toNum(get("LINE追加")),
      answers: toNum(get("回答数")),
      answer_rate: toNum(get("回答率_pct")),
      answer_cpa: toNum(get("回答CPA")),
      customers: toNum(get("顧客数")),
      contracts: toNum(get("成約数")),
      revenue: toNum(get("売上")),
      roi: toNum(get("ROI_pct")),
      score: toNum(get("事業貢献スコア")),
    });
  }

  return { rows, errors };
}

const MEDIA_BADGE: Record<string, string> = {
  "Meta広告": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Tik広告": "bg-black/10 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  "Go広告": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "SEO": "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  "ASP": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "公式Insta": "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

function MediaBadge({ media }: { media: string }) {
  const cls = MEDIA_BADGE[media] ?? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{media}</span>
  );
}

function fmt(v: number | null, suffix = "", digits = 0): string {
  if (v === null) return "—";
  return v.toLocaleString("ja-JP", { maximumFractionDigits: digits }) + suffix;
}

export default function AdDataPage() {
  const [records, setRecords] = useState<AdPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; errors: string[] } | null>(null);
  const [previewRows, setPreviewRows] = useState<AdPerformanceImportRow[] | null>(null);
  const [pendingRows, setPendingRows] = useState<AdPerformanceImportRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [sortKey, setSortKey] = useState<"score" | "roi" | "spend" | "revenue">("score");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const data = await getAllAdPerformance();
      data.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));
      setRecords(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  const handleFile = async (file: File) => {
    setImportResult(null);
    setPreviewRows(null);
    setPendingRows(null);
    setParseErrors([]);
    const buffer = await file.arrayBuffer();
    const { rows, errors } = parseExcel(buffer);
    setParseErrors(errors);
    if (rows.length > 0) {
      setPreviewRows(rows.slice(0, 10));
      setPendingRows(rows);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleImport = async () => {
    if (!pendingRows || pendingRows.length === 0) return;
    setImporting(true);
    try {
      const result = await importAdPerformance(pendingRows);
      setImportResult(result);
      setPreviewRows(null);
      setPendingRows(null);
      await fetchAll();
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteOne = async (id: number) => {
    await deleteAdPerformance(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      await deleteAllAdPerformance();
      setRecords([]);
      setConfirmDeleteAll(false);
    } finally {
      setDeletingAll(false);
    }
  };

  const sortedRecords = [...records].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return (bv as number) - (av as number);
  });

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">広告実績データ</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Excelファイル（動画ランキングシート）から広告実績をインポートし、動画コードと紐付けます
        </p>
      </div>

      {/* Import Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Excelインポート</h2>

        <div
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-4xl mb-2">📊</div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            .xlsx / .xls ファイルをドロップ、またはクリックして選択
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            「動画ランキング」シートを自動検出します
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
          />
        </div>

        {parseErrors.length > 0 && (
          <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-1">パース警告 ({parseErrors.length}件)</p>
            {parseErrors.slice(0, 3).map((e, i) => (
              <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">{e}</p>
            ))}
            {parseErrors.length > 3 && <p className="text-xs text-yellow-500">…他 {parseErrors.length - 3} 件</p>}
          </div>
        )}

        {previewRows && previewRows.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              プレビュー（先頭10行 / 合計 {pendingRows?.length ?? 0} 件）
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    {["コード", "媒体", "消化金額", "回答数", "回答率%", "顧客数", "売上", "ROI%", "スコア"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{r.code}</td>
                      <td className="px-3 py-1.5"><MediaBadge media={r.media} /></td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.spend, "円")}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.answers, "件")}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.answer_rate, "%", 1)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.customers, "人")}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.revenue, "円")}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-400">{fmt(r.roi, "%", 1)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-blue-600 dark:text-blue-400">{fmt(r.score, "", 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {importing ? (
                  <><span className="animate-spin">⟳</span> インポート中...</>
                ) : (
                  `✓ ${pendingRows?.length ?? 0} 件をインポート`
                )}
              </button>
              <button
                onClick={() => { setPreviewRows(null); setPendingRows(null); }}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className={`mt-3 p-3 rounded-lg border ${importResult.errors.length === 0
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
          }`}>
            <p className={`text-sm font-medium ${importResult.errors.length === 0 ? "text-green-800 dark:text-green-300" : "text-yellow-800 dark:text-yellow-300"}`}>
              インポート完了: {importResult.inserted} 件を追加/更新
              {importResult.errors.length > 0 && ` / エラー ${importResult.errors.length} 件`}
            </p>
            {importResult.errors.slice(0, 2).map((e, i) => (
              <p key={i} className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">{e}</p>
            ))}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              登録済みデータ
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                ({records.length} 件)
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600 dark:text-gray-400">並び替え:</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
            >
              <option value="score">事業貢献スコア</option>
              <option value="roi">ROI</option>
              <option value="revenue">売上</option>
              <option value="spend">消化金額</option>
            </select>
            {records.length > 0 && (
              confirmDeleteAll ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 dark:text-red-400">本当に全削除しますか？</span>
                  <button
                    onClick={handleDeleteAll}
                    disabled={deletingAll}
                    className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                  >
                    {deletingAll ? "削除中..." : "削除する"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteAll(false)}
                    className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteAll(true)}
                  className="px-3 py-1.5 text-xs text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  全削除
                </button>
              )
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <p>まだデータがありません。上からExcelをインポートしてください。</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {["コード", "媒体", "消化金額", "LINE追加", "回答数", "回答率%", "回答CPA", "顧客数", "成約数", "売上", "ROI%", "スコア", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sortedRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.code}</td>
                    <td className="px-3 py-2 whitespace-nowrap"><MediaBadge media={r.media} /></td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.spend, "円")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.line_adds, "人")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.answers, "件")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.answer_rate, "%", 1)}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.answer_cpa, "円")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.customers, "人")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.contracts, "件")}</td>
                    <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 whitespace-nowrap">{fmt(r.revenue, "円")}</td>
                    <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${(r.roi ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {fmt(r.roi, "%", 1)}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                      {fmt(r.score, "", 1)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleDeleteOne(r.id)}
                        className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 text-xs"
                        title="削除"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Column mapping reference */}
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">対応カラム（Excelヘッダー → 内部フィールド）</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(COLUMN_MAP).map(([excel, field]) => (
            <span key={excel} className="text-xs text-gray-500 dark:text-gray-500">
              <span className="font-medium text-gray-700 dark:text-gray-300">{excel}</span> → {field}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
