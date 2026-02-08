import type { Video, KeywordItem, CorrelationItem } from "../types";

function escapeCSVField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateCSV(headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCSVField).join(",");
  const bodyLines = rows.map((row) =>
    row.map(escapeCSVField).join(",")
  );
  return "\uFEFF" + [headerLine, ...bodyLines].join("\r\n");
}

function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: "アップロード済",
  transcribing: "書き起こし中",
  transcribed: "書き起こし完了",
  error: "エラー",
};

export function exportVideoListCSV(videos: Video[]): void {
  const headers = [
    "ファイル名",
    "ファイルサイズ(bytes)",
    "再生時間(秒)",
    "ステータス",
    "ランキング",
    "アップロード日",
  ];
  const rows = videos.map((v) => [
    v.filename,
    String(v.file_size ?? ""),
    String(v.duration_seconds ?? ""),
    STATUS_LABELS[v.status] ?? v.status,
    v.ranking != null ? String(v.ranking) : "",
    v.created_at ?? "",
  ]);
  downloadCSV(`動画一覧_${today()}.csv`, generateCSV(headers, rows));
}

export function exportKeywordAnalysisCSV(keywords: KeywordItem[]): void {
  const headers = ["キーワード", "出現回数", "出現動画数"];
  const rows = keywords.map((kw) => [
    kw.keyword,
    String(kw.count),
    String(Object.keys(kw.video_counts).length),
  ]);
  downloadCSV(`キーワード分析_${today()}.csv`, generateCSV(headers, rows));
}

export function exportCorrelationAnalysisCSV(
  correlations: CorrelationItem[]
): void {
  const headers = [
    "キーワード",
    "効果スコア",
    "含む動画の平均CV",
    "含まない動画の平均CV",
    "動画数",
  ];
  const rows = correlations.map((c) => [
    c.keyword,
    String(c.effectiveness_score ?? ""),
    String(c.avg_conversion_with ?? ""),
    String(c.avg_conversion_without ?? ""),
    String(c.video_count ?? ""),
  ]);
  downloadCSV(`相関分析_${today()}.csv`, generateCSV(headers, rows));
}

interface ConversionRow {
  video_id?: number;
  metric_name: string;
  metric_value: number;
  date_recorded?: string;
  notes?: string;
}

export function exportConversionCSV(conversions: ConversionRow[]): void {
  const headers = ["動画ID", "指標名", "値", "記録日", "メモ"];
  const rows = conversions.map((c) => [
    String(c.video_id ?? ""),
    c.metric_name,
    String(c.metric_value),
    c.date_recorded ?? "",
    c.notes ?? "",
  ]);
  downloadCSV(`コンバージョン_${today()}.csv`, generateCSV(headers, rows));
}
