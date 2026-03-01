import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { createCompetitor, getCompetitors, updateCompetitor, deleteCompetitor } from "../../api/competitors";
import type { Competitor, ConversionSummary } from "../../types";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

interface Props {
  convSummaries: ConversionSummary[];
  allMetrics: string[];
  showToast: (msg: string, type: "success" | "error") => void;
}

export default function CompetitorTab({ convSummaries, allMetrics, showToast }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"bar" | "radar">("bar");

  const [name, setName] = useState("");
  const [metricEntries, setMetricEntries] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchCompetitors = useCallback(async () => {
    try {
      setCompetitors(await getCompetitors());
    } catch {
      showToast("競合データの取得に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCompetitors();
  }, [fetchCompetitors]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setMetricEntries([{ key: "", value: "" }]);
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast("名前を入力してください", "error");
      return;
    }

    const metrics: Record<string, number> = {};
    for (const entry of metricEntries) {
      if (entry.key.trim() && entry.value.trim()) {
        const value = Number(entry.value);
        if (isFinite(value)) {
          metrics[entry.key.trim()] = value;
        }
      }
    }

    try {
      if (editingId) {
        await updateCompetitor(editingId, { name: name.trim(), metrics, notes: notes.trim() || null });
      } else {
        await createCompetitor({ name: name.trim(), metrics, notes: notes.trim() || undefined });
      }

      resetForm();
      await fetchCompetitors();
      showToast(editingId ? "更新しました" : "追加しました", "success");
    } catch {
      showToast("保存に失敗しました", "error");
    }
  };

  const handleEdit = (competitor: Competitor) => {
    setEditingId(competitor.id);
    setName(competitor.name);
    setNotes(competitor.notes ?? "");
    const entries = Object.entries(competitor.metrics).map(([key, value]) => ({ key, value: String(value) }));
    setMetricEntries(entries.length > 0 ? entries : [{ key: "", value: "" }]);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("この競合データを削除しますか？")) return;

    try {
      await deleteCompetitor(id);
      await fetchCompetitors();
      showToast("削除しました", "success");
    } catch {
      showToast("削除に失敗しました", "error");
    }
  };

  const allNames = useMemo(() => {
    const own = convSummaries.map((summary) => ({
      name: summary.video_filename,
      metrics: summary.metrics,
      isOwn: true,
    }));
    const comp = competitors.map((competitor) => ({
      name: competitor.name,
      metrics: competitor.metrics,
      isOwn: false,
    }));
    return [...own, ...comp];
  }, [convSummaries, competitors]);

  const combinedMetrics = useMemo(() => {
    const keys = new Set<string>();
    allNames.forEach((item) => Object.keys(item.metrics).forEach((key) => keys.add(key)));
    return Array.from(keys);
  }, [allNames]);

  const barData = useMemo(() => {
    return combinedMetrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      allNames.forEach((item) => {
        row[item.name] = item.metrics[metric] ?? 0;
      });
      return row;
    });
  }, [allNames, combinedMetrics]);

  const radarData = useMemo(() => {
    const mins: Record<string, number> = {};
    const maxes: Record<string, number> = {};

    for (const metric of combinedMetrics) {
      const values = allNames.map((item) => item.metrics[metric] ?? 0);
      mins[metric] = Math.min(...values, 0);
      maxes[metric] = Math.max(...values, 1);
    }

    return combinedMetrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      for (const item of allNames) {
        const raw = item.metrics[metric] ?? 0;
        const range = maxes[metric] - mins[metric];
        row[item.name] = range > 0 ? Math.round(((raw - mins[metric]) / range) * 100) : 50;
      }
      return row;
    });
  }, [allNames, combinedMetrics]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          {editingId ? "競合データ編集" : "競合データ追加"}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="競合名"
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="メモ・補足"
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {metricEntries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={entry.key}
                onChange={(event) => {
                  const copy = [...metricEntries];
                  copy[index].key = event.target.value;
                  setMetricEntries(copy);
                }}
                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">指標</option>
                {allMetrics.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={entry.value}
                onChange={(event) => {
                  const copy = [...metricEntries];
                  copy[index].value = event.target.value;
                  setMetricEntries(copy);
                }}
                placeholder="値"
                className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              {metricEntries.length > 1 && (
                <button
                  onClick={() => setMetricEntries(metricEntries.filter((_, itemIndex) => itemIndex !== index))}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMetricEntries([...metricEntries, { key: "", value: "" }])}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              + 指標を追加
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              {editingId ? "更新" : "追加"}
            </button>
            {editingId && (
              <button
                onClick={resetForm}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                キャンセル
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
      ) : competitors.length > 0 ? (
        <div className="space-y-2">
          {competitors.map((competitor) => (
            <div
              key={competitor.id}
              className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{competitor.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Object.entries(competitor.metrics).map(([key, value]) => `${key}: ${value}`).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleEdit(competitor)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(competitor.id)}
                  className="rounded-md border border-red-300 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {allNames.length >= 2 && combinedMetrics.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("bar")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "bar" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
            >
              棒グラフ
            </button>
            <button
              onClick={() => setViewMode("radar")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "radar" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}
            >
              レーダー
            </button>
          </div>

          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
            {viewMode === "bar" ? (
              <ResponsiveContainer width="100%" height={Math.max(300, combinedMetrics.length * 50 + 80)}>
                <BarChart data={barData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="metric" type="category" width={95} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {allNames.map((item, index) => (
                    <Bar key={item.name} dataKey={item.name} fill={COLORS[index % COLORS.length]} radius={[0, 4, 4, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  {allNames.map((item, index) => (
                    <Radar
                      key={item.name}
                      name={item.name}
                      dataKey={item.name}
                      stroke={COLORS[index % COLORS.length]}
                      fill={COLORS[index % COLORS.length]}
                      fillOpacity={0.15}
                    />
                  ))}
                  <Legend />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}
