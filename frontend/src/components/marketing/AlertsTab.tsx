import { useState, useEffect, useCallback } from "react";
import { createAlert, getAlerts, updateAlert, deleteAlert, checkAlerts } from "../../api/alerts";
import type { Alert, TriggeredAlert, Video } from "../../types";

interface Props {
  allMetrics: string[];
  videos: Video[];
  showToast: (msg: string, type: "success" | "error") => void;
}

export default function AlertsTab({ allMetrics, videos, showToast }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [triggered, setTriggered] = useState<TriggeredAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [metricName, setMetricName] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("below");
  const [threshold, setThreshold] = useState("");
  const [videoId, setVideoId] = useState<number | "">("");

  const fetchData = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([getAlerts(), checkAlerts()]);
      setAlerts(a);
      setTriggered(t);
    } catch { showToast("アラートの取得に失敗しました", "error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!metricName || !threshold.trim()) { showToast("指標名と閾値を入力してください", "error"); return; }
    const val = Number(threshold);
    if (!isFinite(val)) { showToast("有効な数値を入力してください", "error"); return; }
    try {
      await createAlert({ metric_name: metricName, condition, threshold: val, video_id: videoId || null });
      setMetricName(""); setThreshold(""); setVideoId("");
      await fetchData();
      showToast("アラートを作成しました", "success");
    } catch { showToast("作成に失敗しました", "error"); }
  };

  const handleToggle = async (alert: Alert) => {
    try {
      await updateAlert(alert.id, { enabled: !alert.enabled });
      await fetchData();
    } catch { showToast("更新に失敗しました", "error"); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("このアラートを削除しますか？")) return;
    try { await deleteAlert(id); await fetchData(); showToast("削除しました", "success"); }
    catch { showToast("削除に失敗しました", "error"); }
  };

  const triggeredIds = new Set(triggered.map((t) => t.id));

  return (
    <div className="space-y-6">
      {/* Triggered alerts */}
      {triggered.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">発動中のアラート ({triggered.length}件)</h3>
          {triggered.map((t, i) => (
            <div key={`${t.id}-${i}`} className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 flex items-center gap-3">
              <svg className="h-5 w-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {t.video_filename}: {t.metric_name} = {t.current_value}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  閾値 {t.condition === "above" ? ">" : "<"} {t.threshold}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">新規アラート</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <select value={metricName} onChange={(e) => setMetricName(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">指標名</option>
            {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={condition} onChange={(e) => setCondition(e.target.value as "above" | "below")}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="below">下回る</option>
            <option value="above">上回る</option>
          </select>
          <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="閾値"
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" />
          <select value={videoId} onChange={(e) => setVideoId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <option value="">全動画対象</option>
            {videos.map((v) => <option key={v.id} value={v.id}>{v.filename}</option>)}
          </select>
          <button onClick={handleCreate} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors">
            作成
          </button>
        </div>
      </div>

      {/* Alert list */}
      {loading ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">アラートルールがありません。</p>
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">指標</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">条件</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">閾値</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">対象</th>
                <th className="text-center py-2.5 px-4 font-medium text-gray-500 dark:text-gray-400">状態</th>
                <th className="py-2.5 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className={`border-b border-gray-100 dark:border-gray-700/50 ${triggeredIds.has(a.id) ? "bg-red-50 dark:bg-red-900/10" : ""}`}>
                  <td className="py-2.5 px-4 font-medium text-gray-700 dark:text-gray-300">{a.metric_name}</td>
                  <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">{a.condition === "above" ? "上回る" : "下回る"}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-gray-900 dark:text-white">{a.threshold}</td>
                  <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">
                    {a.video_id ? videos.find((v) => v.id === a.video_id)?.filename ?? `#${a.video_id}` : "全動画"}
                  </td>
                  <td className="py-2.5 px-4 text-center">
                    <button onClick={() => handleToggle(a)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${a.enabled ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                      {a.enabled ? "有効" : "無効"}
                    </button>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button onClick={() => handleDelete(a.id)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
