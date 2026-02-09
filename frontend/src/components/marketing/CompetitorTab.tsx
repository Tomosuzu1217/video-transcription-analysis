import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
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

  // Form
  const [name, setName] = useState("");
  const [metricEntries, setMetricEntries] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchCompetitors = useCallback(async () => {
    try { setCompetitors(await getCompetitors()); }
    catch { showToast("競合データの取得に失敗しました", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);

  const handleSubmit = async () => {
    if (!name.trim()) { showToast("名前を入力してください", "error"); return; }
    const metrics: Record<string, number> = {};
    for (const e of metricEntries) {
      if (e.key.trim() && e.value.trim()) {
        const val = Number(e.value);
        if (isFinite(val)) metrics[e.key.trim()] = val;
      }
    }
    try {
      if (editingId) {
        await updateCompetitor(editingId, { name: name.trim(), metrics, notes: notes.trim() || null });
        setEditingId(null);
      } else {
        await createCompetitor({ name: name.trim(), metrics, notes: notes.trim() || undefined });
      }
      setName(""); setMetricEntries([{ key: "", value: "" }]); setNotes("");
      await fetchCompetitors();
      showToast(editingId ? "更新しました" : "追加しました", "success");
    } catch { showToast("保存に失敗しました", "error"); }
  };

  const handleEdit = (c: Competitor) => {
    setEditingId(c.id);
    setName(c.name);
    setNotes(c.notes ?? "");
    const entries = Object.entries(c.metrics).map(([key, value]) => ({ key, value: String(value) }));
    setMetricEntries(entries.length > 0 ? entries : [{ key: "", value: "" }]);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("この競合データを削除しますか？")) return;
    try { await deleteCompetitor(id); await fetchCompetitors(); showToast("削除しました", "success"); }
    catch { showToast("削除に失敗しました", "error"); }
  };

  // Combined data for charts
  const allNames = useMemo(() => {
    const own = convSummaries.map((s) => ({ name: s.video_filename, metrics: s.metrics, isOwn: true }));
    const comp = competitors.map((c) => ({ name: c.name, metrics: c.metrics, isOwn: false }));
    return [...own, ...comp];
  }, [convSummaries, competitors]);

  const combinedMetrics = useMemo(() => {
    const set = new Set<string>();
    allNames.forEach((n) => Object.keys(n.metrics).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [allNames]);

  // Bar chart data
  const barData = useMemo(() => {
    return combinedMetrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      allNames.forEach((n) => { row[n.name] = n.metrics[metric] ?? 0; });
      return row;
    });
  }, [allNames, combinedMetrics]);

  // Radar chart data (normalized 0-100)
  const radarData = useMemo(() => {
    const mins: Record<string, number> = {};
    const maxes: Record<string, number> = {};
    for (const m of combinedMetrics) {
      const vals = allNames.map((n) => n.metrics[m] ?? 0);
      mins[m] = Math.min(...vals, 0);
      maxes[m] = Math.max(...vals, 1);
    }
    return combinedMetrics.map((metric) => {
      const row: Record<string, string | number> = { metric };
      for (const n of allNames) {
        const raw = n.metrics[metric] ?? 0;
        const range = maxes[metric] - mins[metric];
        row[n.name] = range > 0 ? Math.round(((raw - mins[metric]) / range) * 100) : 50;
      }
      return row;
    });
  }, [allNames, combinedMetrics]);

  return (
    <div className="space-y-6">
      {/* Add/Edit form */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          {editingId ? "競合データ編集" : "競合データ追加"}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="競合名"
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="メモ（任意）"
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
          </div>
          {metricEntries.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={e.key} onChange={(ev) => { const copy = [...metricEntries]; copy[i].key = ev.target.value; setMetricEntries(copy); }}
                className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
                <option value="">指標名</option>
                {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" value={e.value} onChange={(ev) => { const copy = [...metricEntries]; copy[i].value = ev.target.value; setMetricEntries(copy); }}
                placeholder="値" className="w-28 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
              {metricEntries.length > 1 && (
                <button onClick={() => setMetricEntries(metricEntries.filter((_, j) => j !== i))}
                  className="text-red-400 hover:text-red-600 p-1">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={() => setMetricEntries([...metricEntries, { key: "", value: "" }])}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline">+ 指標を追加</button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSubmit} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
              {editingId ? "更新" : "追加"}
            </button>
            {editingId && (
              <button onClick={() => { setEditingId(null); setName(""); setMetricEntries([{ key: "", value: "" }]); setNotes(""); }}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                取消
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Competitor list */}
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
      ) : competitors.length > 0 && (
        <div className="space-y-2">
          {competitors.map((c) => (
            <div key={c.id} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {Object.entries(c.metrics).map(([k, v]) => `${k}: ${v}`).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(c)} className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">編集</button>
                <button onClick={() => handleDelete(c.id)} className="rounded-md border border-red-300 dark:border-red-700 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">削除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts */}
      {allNames.length >= 2 && combinedMetrics.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode("bar")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "bar" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>棒グラフ</button>
            <button onClick={() => setViewMode("radar")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${viewMode === "radar" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}`}>レーダー</button>
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
                  {allNames.map((n, i) => (
                    <Bar key={n.name} dataKey={n.name} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                  {allNames.map((n, i) => (
                    <Radar key={n.name} name={n.name} dataKey={n.name} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} />
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
