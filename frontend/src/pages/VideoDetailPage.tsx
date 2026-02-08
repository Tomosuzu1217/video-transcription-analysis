import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getVideo, getVideoStreamUrl, renameVideo } from "../api/videos";
import { getTranscriptionStatus, retryTranscription, getTranscriptionExportUrl, getQueueStatus, type QueueStatus } from "../api/transcriptions";
import type { Video, TranscriptionStatus, TranscriptionSegment } from "../types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const videoId = Number(id);

  // Video state
  const [video, setVideo] = useState<Video | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Transcription state
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus | null>(null);
  const [loadingTranscription, setLoadingTranscription] = useState(true);
  const [retrying, setRetrying] = useState(false);

  // Queue status
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const activeSegmentRef = useRef<HTMLDivElement>(null);
  const [videoSrc, setVideoSrc] = useState<string>("");

  // Copy state
  const [copied, setCopied] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Playback speed
  const [playbackRate, setPlaybackRate] = useState(1.0);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  // Polling ref
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ----- Data fetching -----

  const fetchVideo = useCallback(async () => {
    try {
      const data = await getVideo(videoId);
      setVideo(data);
      setVideoError(null);
    } catch {
      setVideoError("動画情報の取得に失敗しました。");
    } finally {
      setLoadingVideo(false);
    }
  }, [videoId]);

  const pollFailCount = useRef(0);

  const fetchTranscription = useCallback(async () => {
    try {
      const data = await getTranscriptionStatus(videoId);
      setTranscriptionStatus(data);
      pollFailCount.current = 0;
      if (data.status === "pending" || data.status === "transcribing") {
        try {
          const qs = await getQueueStatus();
          setQueueStatus(qs);
        } catch {
          // queue status is supplementary, ok to skip
        }
      } else {
        setQueueStatus(null);
      }
    } catch {
      pollFailCount.current += 1;
      if (pollFailCount.current >= 3) {
        showToast("書き起こし状態の取得に失敗しています", "error");
        pollFailCount.current = 0;
      }
    } finally {
      setLoadingTranscription(false);
    }
  }, [videoId]);

  // Initial fetch
  useEffect(() => {
    fetchVideo();
    fetchTranscription();
    getVideoStreamUrl(videoId).then((url) => setVideoSrc(url));
  }, [fetchVideo, fetchTranscription, videoId]);

  // Poll transcription status every 5 seconds while pending or transcribing
  useEffect(() => {
    const status = transcriptionStatus?.status;
    const shouldPoll = status === "pending" || status === "transcribing";

    if (shouldPoll) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          fetchTranscription();
        }, 5000);
      }
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [transcriptionStatus?.status, fetchTranscription]);

  // ----- Handlers -----

  const handleRetry = async () => {
    try {
      setRetrying(true);
      await retryTranscription(videoId);
      await fetchTranscription();
      showToast("再書き起こしを開始しました", "success");
    } catch {
      showToast("再書き起こしの開始に失敗しました", "error");
    } finally {
      setRetrying(false);
    }
  };

  const handleSegmentClick = (segment: TranscriptionSegment) => {
    if (videoRef.current) {
      videoRef.current.currentTime = segment.start_time;
      videoRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Scroll active segment into view
  useEffect(() => {
    if (activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [currentTime]);

  // ----- Determine active segment -----

  const segments = transcriptionStatus?.transcription?.segments ?? [];
  const activeSegmentId = segments.find(
    (seg) => currentTime >= seg.start_time && currentTime < seg.end_time
  )?.id ?? null;

  // ----- Loading / Error states -----

  if (loadingVideo) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          <p className="mt-3 text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (videoError || !video) {
    return (
      <div className="space-y-4">
        <Link
          to="/videos"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          動画一覧に戻る
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {videoError ?? "動画が見つかりませんでした。"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/videos"
          className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="動画一覧に戻る"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        {isRenaming ? (
          <form
            className="flex items-center gap-2 flex-1 min-w-0"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameValue.trim()) return;
              try {
                const updated = await renameVideo(videoId, renameValue.trim());
                setVideo(updated);
                setIsRenaming(false);
                showToast("名前を変更しました", "success");
              } catch {
                showToast("名前の変更に失敗しました", "error");
              }
            }}
          >
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-lg font-bold text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setIsRenaming(false)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900 truncate" title={video.filename}>
              {video.filename}
            </h2>
            <button
              onClick={() => {
                setRenameValue(video.filename);
                setIsRenaming(true);
              }}
              className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors"
              title="名前を変更"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Two-column layout: Video (left) + Transcription (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Left column: Video player */}
        <div className="flex flex-col gap-3">
          {/* Video player */}
          <div className="rounded-xl bg-black shadow-sm">
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              onTimeUpdate={handleTimeUpdate}
              className="w-full aspect-video rounded-xl"
              style={{ position: 'relative', zIndex: 1 }}
            />
          </div>

          {/* Playback speed control */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500">再生速度</span>
            <div className="flex items-center gap-1">
              {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  onClick={() => {
                    setPlaybackRate(rate);
                    if (videoRef.current) videoRef.current.playbackRate = rate;
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    playbackRate === rate
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Transcription */}
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <h3 className="text-base font-semibold text-gray-900">書き起こし</h3>
            {transcriptionStatus?.status === "completed" && transcriptionStatus.transcription && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    const text = transcriptionStatus.transcription?.full_text ?? "";
                    navigator.clipboard.writeText(text).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  title="テキストをコピー"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copied ? "OK" : "コピー"}
                </button>
                <a
                  href={getTranscriptionExportUrl(videoId, "txt")}
                  download
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  TXT
                </a>
                <a
                  href={getTranscriptionExportUrl(videoId, "srt")}
                  download
                  className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  SRT
                </a>
              </div>
            )}
          </div>

          {loadingTranscription ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <div className="text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
                <p className="mt-2 text-sm text-gray-500">読み込み中...</p>
              </div>
            </div>
          ) : transcriptionStatus?.status === "pending" || transcriptionStatus?.status === "transcribing" ? (
            <div className="flex items-center justify-center py-12 flex-1">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
                <p className="mt-3 text-sm font-medium text-blue-600 animate-pulse">
                  {queueStatus?.current_video_id === videoId
                    ? queueStatus?.current_step === "downloading"
                      ? "動画をダウンロード中..."
                      : queueStatus?.current_step === "preparing"
                      ? "データ変換中..."
                      : queueStatus?.current_step === "transcribing"
                      ? "音声解析中..."
                      : queueStatus?.current_step === "saving"
                      ? "結果を保存中..."
                      : "処理中..."
                    : "書き起こし待機中..."}
                </p>
                {queueStatus?.current_video_id === videoId && queueStatus?.current_elapsed_seconds != null && (
                  <p className="mt-1 text-xs text-gray-400">
                    経過: {queueStatus.current_elapsed_seconds}秒
                  </p>
                )}
              </div>
            </div>
          ) : transcriptionStatus?.status === "error" ? (
            <div className="px-4 py-8 text-center flex-1">
              <p className="text-sm text-red-600 mb-3">書き起こしに失敗しました。</p>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {retrying ? "再試行中..." : "再試行"}
              </button>
            </div>
          ) : transcriptionStatus?.status === "completed" && segments.length > 0 ? (
            <div className="overflow-y-auto flex-1">
              {/* Progress bar */}
              {video?.duration_seconds && (
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 tabular-nums">
                      {formatTimestamp(currentTime)}
                    </span>
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${(currentTime / video.duration_seconds) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-500 tabular-nums">
                      {formatTimestamp(video.duration_seconds)}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-3 space-y-1">
                {segments.map((segment) => {
                  const isActive = segment.id === activeSegmentId;
                  return (
                    <div
                      key={segment.id}
                      ref={isActive ? activeSegmentRef : undefined}
                      onClick={() => handleSegmentClick(segment)}
                      className={`group p-2.5 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? "bg-blue-50 ring-1 ring-blue-200"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`shrink-0 text-xs tabular-nums px-1.5 py-0.5 rounded ${
                          isActive
                            ? "bg-blue-100 text-blue-700 font-medium"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {formatTimestamp(segment.start_time)}
                        </span>
                        <p className={`text-sm leading-relaxed ${
                          isActive ? "text-gray-900" : "text-gray-600"
                        }`}>
                          {segment.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-4 py-12 text-center flex-1">
              <p className="text-sm text-gray-400">書き起こしデータがありません。</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 rounded p-0.5 hover:bg-white/20">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
