import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ConversionSummary, AdPerformance, Video } from "../../types";

interface Props {
  convSummaries: ConversionSummary[];
  allMetrics: string[];
  adPerfMap?: Map<string, AdPerformance>;
  videos?: Video[];
}

interface ROIRow {
  name: string;
  fullName: string;
  revenue: number;
  cost: number;
  roi: number;
  roas: number;
  cpa: number | null;
}

export default function ROITab({ convSummaries, allMetrics, adPerfMap, videos }: Props) {
  const [revenueMetric, setRevenueMetric] = useState("");
  const [costMetric, setCostMetric] = useState("");
  const [useAdData, setUseAdData] = useState(false);

  const hasAdData = adPerfMap && adPerfMap.size > 0 && videos && videos.length > 0;

  const roiData = useMemo((): ROIRow[] => {
    // 広告実績モード
    if (useAdData && hasAdData) {
      const rows: ROIRow[] = [];
      for (const video of videos!) {
        if (!video.code) continue;
        const ad = adPerfMap!.get(video.code);
        if (!ad || ad.revenue === null || ad.spend === null) continue;
        const revenue = ad.revenue;
        const cost = ad.spend;
        const roi = cost !== 0 ? ((revenue - cost) / Math.abs(cost)) * 100 : 0;
        const roas = cost !== 0 ? revenue / Math.abs(cost) : 0;
        const cpa = revenue !== 0 ? cost / revenue : null;
        rows.push({
          name: video.filename.length > 12 ? video.filename.slice(0, 12) + "..." : video.filename,
          fullName: `${video.filename}${video.code ? ` [${video.code}]` : ""}`,
          revenue,
          cost,
          roi: Math.round(roi * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          cpa: cpa !== null ? Math.round(cpa * 100) / 100 : null,
        });
      }
      return rows.sort((a, b) => b.roi - a.roi);
    }

    // 通常モード（コンバージョン指標選択）
    if (!revenueMetric || !costMetric) return [];
    return convSummaries
      .filter((s) => s.metrics[revenueMetric] !== undefined && s.metrics[costMetric] !== undefined)
      .map((s) => {
        const revenue = s.metrics[revenueMetric];
        const cost = s.metrics[costMetric];
        const roi = cost !== 0 ? ((revenue - cost) / Math.abs(cost)) * 100 : 0;
        const roas = cost !== 0 ? revenue / Math.abs(cost) : 0;
        const cpa = revenue !== 0 ? cost / revenue : null;
        return {
          name: s.video_filename.length > 12 ? s.video_filename.slice(0, 12) + "..." : s.video_filename,
          fullName: s.video_filename,
          revenue,
          cost,
          roi: Math.round(roi * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          cpa: cpa !== null ? Math.round(cpa * 100) / 100 : null,
        };
      })
      .sort((a, b) => b.roi - a.roi);
  }, [convSummaries, revenueMetric, costMetric, useAdData, hasAdData, adPerfMap, videos]);

  const totals = useMemo(() => {
    if (roiData.length === 0) return null;
    const totalRev = roiData.reduce((a, b) => a + b.revenue, 0);
    const totalCost = roiData.reduce((a, b) => a + b.cost, 0);
    return {
      revenue: totalRev,
      cost: totalCost,
      roi: totalCost !== 0 ? Math.round(((totalRev - totalCost) / Math.abs(totalCost)) * 10000) / 100 : 0,
      roas: totalCost !== 0 ? Math.round((totalRev / Math.abs(totalCost)) * 100) / 100 : 0,
    };
  }, [roiData]);

  return (
    <div className="space-y-6">
      {/* Ad data mode toggle */}
      {hasAdData && (
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">広告実績データあり</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              インポート済みの実績データ（売上・消化金額）でROIを自動計算できます
            </p>
          </div>
          <button
            onClick={() => setUseAdData((v) => !v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              useAdData
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            }`}
          >
            {useAdData ? "✓ 広告実績から計算中" : "広告実績から計算"}
          </button>
        </div>
      )}

      {/* Metric selection (shown when not using ad data) */}
      {!useAdData && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">ROI 設定</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">収益指標</label>
              <select value={revenueMetric} onChange={(e) => setRevenueMetric(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
                <option value="">選択してください</option>
                {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">費用指標</label>
              <select value={costMetric} onChange={(e) => setCostMetric(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none">
                <option value="">選択してください</option>
                {allMetrics.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">総収益</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totals.revenue.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">総費用</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totals.cost.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">ROI</p>
            <p className={`text-2xl font-bold mt-1 ${totals.roi >= 0 ? "text-green-600" : "text-red-600"}`}>{totals.roi}%</p>
          </div>
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">ROAS</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totals.roas}x</p>
          </div>
        </div>
      )}

      {/* ROI bar chart */}
      {roiData.length > 0 ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">動画別 ROI</h3>
          <ResponsiveContainer width="100%" height={Math.max(250, roiData.length * 40 + 60)}>
            <BarChart data={roiData} layout="vertical" margin={{ left: 100, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" unit="%" />
              <YAxis dataKey="name" type="category" width={95} tick={{ fontSize: 12 }} />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0]?.payload as ROIRow;
                return (
                  <div className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 px-3 py-2 shadow-lg text-xs">
                    <p className="font-bold text-gray-900 dark:text-white">{d.fullName}</p>
                    <p className="text-gray-600 dark:text-gray-300">ROI: {d.roi}%</p>
                    <p className="text-gray-600 dark:text-gray-300">ROAS: {d.roas}x</p>
                    {d.cpa !== null && <p className="text-gray-600 dark:text-gray-300">CPA: {d.cpa}</p>}
                  </div>
                );
              }} />
              <Bar dataKey="roi" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : revenueMetric && costMetric ? (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-8 text-center shadow-sm">
          <p className="text-sm text-gray-400 dark:text-gray-500">選択した指標を両方持つ動画がありません。</p>
        </div>
      ) : null}

      {/* Detail table */}
      {roiData.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-5 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-500 dark:text-gray-400">動画</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">収益</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">費用</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">ROI</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">ROAS</th>
                <th className="text-right py-2 px-3 font-medium text-gray-500 dark:text-gray-400">CPA</th>
              </tr>
            </thead>
            <tbody>
              {roiData.map((d) => (
                <tr key={d.fullName} className="border-b border-gray-100 dark:border-gray-700/50">
                  <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{d.fullName}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-white">{d.revenue.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-900 dark:text-white">{d.cost.toLocaleString()}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-bold ${d.roi >= 0 ? "text-green-600" : "text-red-600"}`}>{d.roi}%</td>
                  <td className="py-2 px-3 text-right tabular-nums text-blue-600 dark:text-blue-400">{d.roas}x</td>
                  <td className="py-2 px-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{d.cpa ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
