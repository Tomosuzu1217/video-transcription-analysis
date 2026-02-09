import { useEffect, useState } from "react";
import type { BatchProgress, VideoProgress, VideoTranscriptionStage } from "../types";

interface BatchProgressPanelProps {
  progress: BatchProgress;
  onCancel: () => void;
}

const STAGES: VideoTranscriptionStage[] = [
  "downloading", "preparing", "transcribing", "saving", "completed",
];

const STAGE_LABELS: Record<VideoTranscriptionStage, string> = {
  queued: "待機中",
  downloading: "DL",
  preparing: "変換",
  transcribing: "AI処理",
  saving: "保存",
  completed: "完了",
  error: "エラー",
};

function stageIndex(stage: VideoTranscriptionStage): number {
  const idx = STAGES.indexOf(stage);
  return idx >= 0 ? idx : -1;
}

function stagePercent(stage: VideoTranscriptionStage): number {
  if (stage === "queued") return 0;
  if (stage === "error") return 0;
  const idx = stageIndex(stage);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / STAGES.length) * 100);
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(sec: number | undefined): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
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

function stageColor(stage: VideoTranscriptionStage): string {
  switch (stage) {
    case "queued": return "text-gray-400";
    case "downloading": case "preparing": case "saving": return "text-blue-600";
    case "transcribing": return "text-yellow-600";
    case "completed": return "text-green-600";
    case "error": return "text-red-600";
  }
}

function stageBarColor(stage: VideoTranscriptionStage): string {
  switch (stage) {
    case "completed": return "bg-green-500";
    case "error": return "bg-red-400";
    case "transcribing": return "bg-yellow-500";
    default: return "bg-blue-500";
  }
}

/** Ticking elapsed time per-video */
function ElapsedTime({ startedAt, completedAt }: { startedAt?: number; completedAt?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (completedAt || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, completedAt]);
  if (!startedAt) return null;
  const elapsed = Math.round(((completedAt ?? now) - startedAt) / 1000);
  return (
    <span className="text-[10px] text-gray-400 tabular-nums">{formatSeconds(elapsed)}</span>
  );
}

function StepIndicator({ stage }: { stage: VideoTranscriptionStage }) {
  const current = stageIndex(stage);
  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((s, i) => {
        const active = stage !== "queued" && stage !== "error" && i <= current;
        const isCurrent = stage !== "queued" && stage !== "error" && i === current && stage !== "completed";
        return (
          <div key={s} className="flex items-center gap-0.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i < STAGES.length - 1 ? "w-5" : "w-5"
              } ${
                active
                  ? isCurrent
                    ? `${stageBarColor(stage)} animate-pulse`
                    : stage === "completed" ? "bg-green-500" : "bg-blue-500"
                  : "bg-gray-200"
              }`}
              title={STAGE_LABELS[s]}
            />
          </div>
        );
      })}
    </div>
  );
}

function VideoRow({ vp }: { vp: VideoProgress }) {
  const isActive = vp.stage !== "queued" && vp.stage !== "completed" && vp.stage !== "error";
  const pct = stagePercent(vp.stage);

  return (
    <div className={`px-4 py-2.5 transition-colors ${isActive ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
      {/* Row 1: Icon + filename + elapsed + stage label */}
      <div className="flex items-center gap-2.5">
        {/* Icon */}
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

        {/* Filename + file info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-800 truncate font-medium">
              {vp.filename || `Video #${vp.videoId}`}
            </span>
            {(vp.fileSizeBytes || vp.durationSeconds) && (
              <span className="text-[10px] text-gray-400 shrink-0">
                {formatFileSize(vp.fileSizeBytes)}
                {vp.fileSizeBytes && vp.durationSeconds ? " / " : ""}
                {formatDuration(vp.durationSeconds)}
              </span>
            )}
          </div>
        </div>

        {/* Right side: elapsed + key + stage */}
        <div className="flex items-center gap-2 shrink-0">
          <ElapsedTime startedAt={vp.startedAt} completedAt={vp.completedAt} />
          {vp.apiKeyIndex != null && isActive && (
            <span className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
              Key#{vp.apiKeyIndex + 1}
            </span>
          )}
          <span className={`text-xs font-semibold min-w-[4rem] text-right ${stageColor(vp.stage)}`}>
            {vp.stage === "queued" ? "待機中" : vp.stage === "error" ? "エラー" : STAGE_LABELS[vp.stage]}
          </span>
        </div>
      </div>

      {/* Row 2: Step indicator + detail message */}
      {vp.stage !== "queued" && (
        <div className="mt-1.5 ml-[30px] flex items-center gap-3">
          <StepIndicator stage={vp.stage} />
          <span className={`text-[11px] truncate ${stageColor(vp.stage)} ${vp.stage === "transcribing" ? "animate-pulse" : ""}`}>
            {vp.detail || ""}
          </span>
        </div>
      )}

      {/* Row 2 alt: progress bar for active items */}
      {isActive && (
        <div className="mt-1 ml-[30px]">
          <div className="h-1 w-full max-w-xs rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${stageBarColor(vp.stage)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error detail */}
      {vp.stage === "error" && vp.error && (
        <p className="mt-1 ml-[30px] text-[11px] text-red-500 truncate">{vp.error}</p>
      )}
    </div>
  );
}

export default function BatchProgressPanel({ progress, onCancel }: BatchProgressPanelProps) {
  const [now, setNow] = useState(Date.now());
  const {
    totalVideos, completedVideos, errorVideos, activeWorkers, totalWorkers,
    videoProgress, keyStatuses, avgSecondsPerVideo, estimatedSecondsRemaining,
    isRunning, isCancelled,
  } = progress;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const overallPercent = totalVideos > 0
    ? Math.round(((completedVideos + errorVideos) / totalVideos) * 100)
    : 0;

  const videos = Array.from(videoProgress.values());
  const stagePriority: Record<VideoTranscriptionStage, number> = {
    transcribing: 0, downloading: 1, preparing: 2, saving: 3,
    queued: 4, error: 5, completed: 6,
  };
  videos.sort((a, b) => stagePriority[a.stage] - stagePriority[b.stage]);

  const elapsed = Math.round((now - progress.startedAt) / 1000);

  const activeCount = videos.filter(v =>
    v.stage !== "queued" && v.stage !== "completed" && v.stage !== "error"
  ).length;

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

      {/* Stats row */}
      <div className="px-5 py-3 border-b border-gray-100">
        {/* Overall progress bar */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">
            全体進捗 {overallPercent}%
          </span>
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="tabular-nums">経過 {formatSeconds(elapsed)}</span>
            {avgSecondsPerVideo != null && (
              <span className="tabular-nums">平均 {formatSeconds(avgSecondsPerVideo)}/件</span>
            )}
            {estimatedSecondsRemaining != null && (
              <span className="tabular-nums font-medium text-blue-600">残り約 {formatSeconds(estimatedSecondsRemaining)}</span>
            )}
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
            style={{ width: `${overallPercent}%` }}
          />
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            処理中 {activeCount}件
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            待機 {videos.filter(v => v.stage === "queued").length}件
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            完了 {completedVideos}件
          </span>
          {errorVideos > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-500">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              エラー {errorVideos}件
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            ワーカー {activeWorkers}/{totalWorkers}
          </span>
        </div>
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

      {/* Stage legend */}
      <div className="px-5 py-1.5 border-b border-gray-100 flex items-center gap-4">
        <span className="text-[10px] text-gray-400">ステージ:</span>
        {STAGES.map((s, i) => (
          <span key={s} className="text-[10px] text-gray-400 flex items-center gap-1">
            <span className="inline-block h-1.5 w-3 rounded-full bg-gray-300" />
            {i + 1}.{STAGE_LABELS[s]}
          </span>
        ))}
      </div>

      {/* Per-video progress list */}
      <div className="max-h-[420px] overflow-y-auto">
        <div className="divide-y divide-gray-100">
          {videos.map((vp) => (
            <VideoRow key={vp.videoId} vp={vp} />
          ))}
        </div>
      </div>
    </div>
  );
}
