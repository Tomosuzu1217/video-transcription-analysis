import type { BatchProgress, VideoTranscriptionStage } from "../types";

interface BatchProgressPanelProps {
  progress: BatchProgress;
  onCancel: () => void;
}

function stageLabel(stage: VideoTranscriptionStage): string {
  switch (stage) {
    case "queued": return "待機中";
    case "downloading": return "ダウンロード中";
    case "preparing": return "変換中";
    case "transcribing": return "書き起こし中";
    case "saving": return "保存中";
    case "completed": return "完了";
    case "error": return "エラー";
  }
}

function stageColor(stage: VideoTranscriptionStage): string {
  switch (stage) {
    case "queued": return "text-gray-400";
    case "downloading": return "text-blue-500";
    case "preparing": return "text-blue-500";
    case "transcribing": return "text-yellow-600 animate-pulse";
    case "saving": return "text-blue-500";
    case "completed": return "text-green-600";
    case "error": return "text-red-600";
  }
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function keyStateLabel(state: string): { label: string; className: string } {
  switch (state) {
    case "available": return { label: "待機", className: "bg-gray-100 text-gray-600" };
    case "working": return { label: "処理中", className: "bg-blue-100 text-blue-700 animate-pulse" };
    case "rate_limited": return { label: "制限中", className: "bg-yellow-100 text-yellow-700" };
    case "error": return { label: "エラー", className: "bg-red-100 text-red-700" };
    default: return { label: state, className: "bg-gray-100 text-gray-600" };
  }
}

export default function BatchProgressPanel({ progress, onCancel }: BatchProgressPanelProps) {
  const {
    totalVideos, completedVideos, errorVideos, activeWorkers, totalWorkers,
    videoProgress, keyStatuses, avgSecondsPerVideo, estimatedSecondsRemaining,
    isRunning, isCancelled,
  } = progress;

  const overallPercent = totalVideos > 0
    ? Math.round(((completedVideos + errorVideos) / totalVideos) * 100)
    : 0;

  const videos = Array.from(videoProgress.values());
  const stagePriority: Record<VideoTranscriptionStage, number> = {
    transcribing: 0, downloading: 1, preparing: 2, saving: 3,
    queued: 4, completed: 5, error: 6,
  };
  videos.sort((a, b) => stagePriority[a.stage] - stagePriority[b.stage]);

  const elapsed = Math.round((Date.now() - progress.startedAt) / 1000);

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning && !isCancelled && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
          )}
          {!isRunning && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500">
              <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          <span className="text-sm font-semibold text-blue-800">
            {isCancelled ? "キャンセル中..." : isRunning ? "一括書き起こし処理中" : "一括書き起こし完了"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-blue-700">
            {completedVideos} / {totalVideos} 完了
          </span>
          {isRunning && !isCancelled && (
            <button
              onClick={onCancel}
              className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              キャンセル
            </button>
          )}
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">
            全体進捗 {overallPercent}%
          </span>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>経過 {formatSeconds(elapsed)}</span>
            {avgSecondsPerVideo != null && (
              <span>平均 {formatSeconds(avgSecondsPerVideo)}/件</span>
            )}
            {estimatedSecondsRemaining != null && (
              <span>残り約 {formatSeconds(estimatedSecondsRemaining)}</span>
            )}
            <span>
              ワーカー {activeWorkers}/{totalWorkers}
            </span>
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        {errorVideos > 0 && (
          <p className="mt-1 text-xs text-red-500">{errorVideos}件のエラーが発生</p>
        )}
      </div>

      {/* API Key statuses */}
      {keyStatuses.length > 1 && (
        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400 mr-1">APIキー:</span>
          {keyStatuses.map((ks) => {
            const { label, className } = keyStateLabel(ks.state);
            return (
              <span
                key={ks.index}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
                title={ks.rateLimitedUntil ? `復帰: ${new Date(ks.rateLimitedUntil).toLocaleTimeString()}` : undefined}
              >
                #{ks.index + 1} {label}
                {ks.completedCount > 0 && <span className="opacity-60">({ks.completedCount}件)</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Per-video progress list */}
      <div className="max-h-72 overflow-y-auto">
        <div className="divide-y divide-gray-50">
          {videos.map((vp) => (
            <div
              key={vp.videoId}
              className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {vp.stage === "completed" ? (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500">
                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : vp.stage === "error" ? (
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500">
                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                ) : vp.stage === "queued" ? (
                  <div className="h-5 w-5 shrink-0 rounded-full border-2 border-gray-300" />
                ) : (
                  <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
                )}

                <div className="min-w-0 flex-1">
                  <span className="text-sm text-gray-700 truncate block">
                    {vp.filename || `Video #${vp.videoId}`}
                  </span>
                  {vp.error && (
                    <span className="text-xs text-red-400 truncate block">{vp.error}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-3">
                {vp.apiKeyIndex != null && vp.stage !== "completed" && vp.stage !== "error" && vp.stage !== "queued" && (
                  <span className="text-xs text-gray-400">Key#{vp.apiKeyIndex + 1}</span>
                )}
                <span className={`text-xs font-medium ${stageColor(vp.stage)}`}>
                  {stageLabel(vp.stage)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
