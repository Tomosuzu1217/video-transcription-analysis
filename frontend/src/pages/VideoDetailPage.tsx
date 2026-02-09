import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getVideo, getVideoStreamUrl, renameVideo, updateVideoRanking, updateVideoTags, archiveVideo } from "../api/videos";
import { getTranscriptionStatus, retryTranscription, getQueueStatus, updateTranscriptionSegment, type QueueStatus } from "../api/transcriptions";
import { createConversion, getConversions, updateConversion, deleteConversion } from "../api/conversions";
import { exportConversionCSV } from "../utils/csv";
import Toast, { useToast } from "../components/Toast";
import StoryboardView from "../components/StoryboardView";
import type { Video, TranscriptionStatus, TranscriptionSegment, Conversion } from "../types";

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatExportTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function downloadTranscriptionExport(
  segments: TranscriptionSegment[],
  fullText: string,
  filename: string,
  format: "txt" | "srt" | "vtt" | "json",
) {
  let content: string;
  let ext = format;
  switch (format) {
    case "txt":
      content = fullText;
      break;
    case "srt":
      content = segments.map((s, i) =>
        `${i + 1}\n${formatExportTime(s.start_time)} --> ${formatExportTime(s.end_time)}\n${s.text}\n`
      ).join("\n");
      break;
    case "vtt":
      content = "WEBVTT\n\n" + segments.map((s) =>
        `${formatExportTime(s.start_time).replace(",", ".")} --> ${formatExportTime(s.end_time).replace(",", ".")}\n${s.text}\n`
      ).join("\n");
      break;
    case "json":
      content = JSON.stringify({ full_text: fullText, segments: segments.map((s) => ({ start_time: s.start_time, end_time: s.end_time, text: s.text })) }, null, 2);
      break;
  }
  const mimeType = format === "json" ? "application/json" : "text/plain";
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const base = filename.replace(/\.[^.]+$/, "");
  a.download = `${base}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
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

  // Segment editing state
  const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);

  // Tag state
  const [newTag, setNewTag] = useState("");

  // Ranking state
  const [editingRanking, setEditingRanking] = useState(false);
  const [rankingValue, setRankingValue] = useState("");
  const [rankingNotes, setRankingNotes] = useState("");
  const [savingRanking, setSavingRanking] = useState(false);

  // Conversion state
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loadingConversions, setLoadingConversions] = useState(true);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricValue, setNewMetricValue] = useState("");
  const [newMetricNotes, setNewMetricNotes] = useState("");
  const [savingConversion, setSavingConversion] = useState(false);
  const [editingConversionId, setEditingConversionId] = useState<number | null>(null);
  const [editConvMetricName, setEditConvMetricName] = useState("");
  const [editConvMetricValue, setEditConvMetricValue] = useState("");
  const [editConvNotes, setEditConvNotes] = useState("");

  // Archive state
  const [archiving, setArchiving] = useState(false);
  const [archiveProgress, setArchiveProgress] = useState("");

  // Toast state
  const { toast, showToast, clearToast } = useToast();

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

  const fetchConversions = useCallback(async () => {
    try {
      const data = await getConversions(videoId);
      setConversions(data);
    } catch { /* ignore */ }
    finally { setLoadingConversions(false); }
  }, [videoId]);

  // Initial fetch
  useEffect(() => {
    fetchVideo();
    fetchTranscription();
    fetchConversions();
    getVideoStreamUrl(videoId).then((url) => setVideoSrc(url)).catch(() => {});
  }, [fetchVideo, fetchTranscription, fetchConversions, videoId]);

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

  const handleEditSegment = (index: number, text: string) => {
    setEditingSegmentIndex(index);
    setEditText(text);
  };

  const handleSaveSegment = async () => {
    if (editingSegmentIndex === null) return;
    try {
      setSavingSegment(true);
      await updateTranscriptionSegment(videoId, editingSegmentIndex, editText);
      await fetchTranscription();
      setEditingSegmentIndex(null);
      showToast("セグメントを更新しました", "success");
    } catch (e: any) {
      showToast(e.message ?? "セグメントの更新に失敗しました", "error");
    } finally {
      setSavingSegment(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingSegmentIndex(null);
    setEditText("");
  };

  // Ranking handlers
  const handleStartEditRanking = () => {
    setRankingValue(video?.ranking != null ? String(video.ranking) : "");
    setRankingNotes(video?.ranking_notes ?? "");
    setEditingRanking(true);
  };

  const handleSaveRanking = async () => {
    try {
      setSavingRanking(true);
      const val = rankingValue.trim() === "" ? null : Number(rankingValue);
      if (val !== null && (!isFinite(val) || val < 1)) {
        showToast("順位は1以上の数値を入力してください", "error");
        return;
      }
      const updated = await updateVideoRanking(videoId, val, rankingNotes);
      setVideo(updated);
      setEditingRanking(false);
      showToast("ランキングを更新しました", "success");
    } catch {
      showToast("ランキングの更新に失敗しました", "error");
    } finally {
      setSavingRanking(false);
    }
  };

  // Tag handlers
  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag || !video) return;
    if ((video.tags ?? []).includes(tag)) { showToast("既に追加済みのタグです", "error"); return; }
    try {
      const updated = await updateVideoTags(videoId, [...(video.tags ?? []), tag]);
      setVideo(updated);
      setNewTag("");
      showToast("タグを追加しました", "success");
    } catch { showToast("タグの追加に失敗しました", "error"); }
  };

  const handleRemoveTag = async (tag: string) => {
    if (!video) return;
    try {
      const updated = await updateVideoTags(videoId, (video.tags ?? []).filter((t) => t !== tag));
      setVideo(updated);
      showToast("タグを削除しました", "success");
    } catch { showToast("タグの削除に失敗しました", "error"); }
  };

  // Conversion handlers
  const handleAddConversion = async () => {
    if (!newMetricName.trim()) { showToast("指標名を入力してください", "error"); return; }
    const val = Number(newMetricValue);
    if (!isFinite(val)) { showToast("有効な数値を入力してください", "error"); return; }
    try {
      setSavingConversion(true);
      await createConversion({
        video_id: videoId,
        metric_name: newMetricName.trim(),
        metric_value: val,
        notes: newMetricNotes.trim() || undefined,
      });
      setNewMetricName("");
      setNewMetricValue("");
      setNewMetricNotes("");
      await fetchConversions();
      showToast("コンバージョンを追加しました", "success");
    } catch (e: any) {
      showToast(e.message ?? "追加に失敗しました", "error");
    } finally {
      setSavingConversion(false);
    }
  };

  const handleStartEditConversion = (conv: Conversion) => {
    setEditingConversionId(conv.id);
    setEditConvMetricName(conv.metric_name);
    setEditConvMetricValue(String(conv.metric_value));
    setEditConvNotes(conv.notes ?? "");
  };

  const handleSaveConversion = async () => {
    if (editingConversionId === null) return;
    const val = Number(editConvMetricValue);
    if (!isFinite(val)) { showToast("有効な数値を入力してください", "error"); return; }
    try {
      await updateConversion(editingConversionId, {
        metric_name: editConvMetricName.trim(),
        metric_value: val,
        notes: editConvNotes.trim() || undefined,
      });
      setEditingConversionId(null);
      await fetchConversions();
      showToast("コンバージョンを更新しました", "success");
    } catch {
      showToast("更新に失敗しました", "error");
    }
  };

  const handleDeleteConversion = async (id: number) => {
    if (!window.confirm("このコンバージョンデータを削除しますか？")) return;
    try {
      await deleteConversion(id);
      await fetchConversions();
      showToast("削除しました", "success");
    } catch {
      showToast("削除に失敗しました", "error");
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleArchive = async () => {
    if (!video || !window.confirm("動画ファイルを削除してサムネイルのみ保持します。この操作は元に戻せません。実行しますか？")) return;
    try {
      setArchiving(true);
      const updated = await archiveVideo(video.id, setArchiveProgress);
      setVideo(updated);
      setVideoSrc("");
      showToast("アーカイブが完了しました", "success");
    } catch (e: any) {
      showToast(e.message ?? "アーカイブに失敗しました", "error");
    } finally {
      setArchiving(false);
      setArchiveProgress("");
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
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate" title={video.filename}>
              {video.filename}
            </h2>
            {video.status === "archived" && (
              <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                アーカイブ済み
              </span>
            )}
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

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        {(video.tags ?? []).map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <form
          onSubmit={(e) => { e.preventDefault(); handleAddTag(); }}
          className="inline-flex items-center gap-1"
        >
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="タグを追加..."
            className="rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-28"
          />
          <button
            type="submit"
            className="rounded-full bg-gray-100 dark:bg-gray-700 p-1 text-gray-500 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 transition-colors"
            title="タグ追加"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </form>
      </div>

      {/* Two-column layout: Video (left) + Transcription (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Left column: Video player or Storyboard */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          {video?.status === "archived" ? (
            /* Storyboard view for archived videos */
            <StoryboardView
              thumbnails={video.thumbnails ?? []}
              segments={segments}
            />
          ) : (
            <>
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
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">再生速度</span>
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
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Archive button */}
              {video?.status === "transcribed" && (
                <button
                  onClick={handleArchive}
                  disabled={archiving}
                  className="flex items-center justify-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  {archiving ? archiveProgress || "アーカイブ中..." : "アーカイブ（動画削除+サムネイル保持）"}
                </button>
              )}
            </>
          )}
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
                {(["txt", "srt", "vtt", "json"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => {
                      const t = transcriptionStatus!.transcription!;
                      downloadTranscriptionExport(t.segments, t.full_text, video.filename, fmt);
                    }}
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
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
                {segments.map((segment, index) => {
                  const isActive = segment.id === activeSegmentId;
                  const isEditing = editingSegmentIndex === index;
                  return (
                    <div
                      key={segment.id}
                      ref={isActive ? activeSegmentRef : undefined}
                      onClick={() => !isEditing && handleSegmentClick(segment)}
                      className={`group p-2.5 rounded-lg transition-all ${
                        isEditing
                          ? "bg-yellow-50 ring-1 ring-yellow-300"
                          : isActive
                          ? "bg-blue-50 ring-1 ring-blue-200 cursor-pointer"
                          : "hover:bg-gray-50 cursor-pointer"
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
                        {isEditing ? (
                          <div className="flex-1 min-w-0 space-y-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              autoFocus
                              rows={3}
                              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") handleCancelEdit();
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveSegment();
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveSegment}
                                disabled={savingSegment}
                                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                {savingSegment ? "保存中..." : "保存"}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                disabled={savingSegment}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                              >
                                取消
                              </button>
                              <span className="text-xs text-gray-400">Ctrl+Enter で保存</span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className={`flex-1 text-sm leading-relaxed ${
                              isActive ? "text-gray-900" : "text-gray-600"
                            }`}>
                              {segment.text}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditSegment(index, segment.text);
                              }}
                              className="shrink-0 rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-500 transition-all"
                              title="編集"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          </>
                        )}
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

      {/* Bottom sections: Ranking + Conversions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking section */}
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">ランキング</h3>
            {!editingRanking && (
              <button
                onClick={handleStartEditRanking}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                編集
              </button>
            )}
          </div>
          {editingRanking ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">順位</label>
                <input
                  type="number"
                  min={1}
                  value={rankingValue}
                  onChange={(e) => setRankingValue(e.target.value)}
                  placeholder="例: 1"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
                <textarea
                  value={rankingNotes}
                  onChange={(e) => setRankingNotes(e.target.value)}
                  rows={2}
                  placeholder="ランキングに関するメモ..."
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveRanking}
                  disabled={savingRanking}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {savingRanking ? "保存中..." : "保存"}
                </button>
                <button
                  onClick={() => setEditingRanking(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                {video.ranking != null && (
                  <button
                    onClick={async () => {
                      setSavingRanking(true);
                      try {
                        const updated = await updateVideoRanking(videoId, null);
                        setVideo(updated);
                        setEditingRanking(false);
                        showToast("ランキングを解除しました", "success");
                      } catch { showToast("解除に失敗しました", "error"); }
                      finally { setSavingRanking(false); }
                    }}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    解除
                  </button>
                )}
              </div>
            </div>
          ) : video.ranking != null ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 border border-yellow-300 px-3 py-1 text-sm font-bold text-yellow-800">
                  {video.ranking}位
                </span>
              </div>
              {video.ranking_notes && (
                <p className="text-sm text-gray-600">{video.ranking_notes}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">ランキング未設定</p>
          )}
        </div>

        {/* Conversions section */}
        <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">コンバージョン</h3>
            {conversions.length > 0 && (
              <button
                onClick={() => exportConversionCSV(conversions.map((c) => ({
                  video_id: c.video_id,
                  metric_name: c.metric_name,
                  metric_value: c.metric_value,
                  date_recorded: c.date_recorded,
                  notes: c.notes ?? undefined,
                })))}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                CSV出力
              </button>
            )}
          </div>

          {/* Add form */}
          <div className="flex items-end gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-500 mb-1">指標名</label>
              <input
                type="text"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
                placeholder="例: クリック数"
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="w-24">
              <label className="block text-xs font-medium text-gray-500 mb-1">値</label>
              <input
                type="number"
                value={newMetricValue}
                onChange={(e) => setNewMetricValue(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAddConversion}
              disabled={savingConversion}
              className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {savingConversion ? "..." : "追加"}
            </button>
          </div>

          {/* Notes for new conversion */}
          <div className="mb-4">
            <input
              type="text"
              value={newMetricNotes}
              onChange={(e) => setNewMetricNotes(e.target.value)}
              placeholder="備考（任意）"
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Conversion list */}
          {loadingConversions ? (
            <p className="text-sm text-gray-400">読み込み中...</p>
          ) : conversions.length === 0 ? (
            <p className="text-sm text-gray-400">コンバージョンデータがありません。</p>
          ) : (
            <div className="space-y-2">
              {conversions.map((conv) => (
                <div key={conv.id} className="group flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                  {editingConversionId === conv.id ? (
                    <>
                      <input
                        type="text"
                        value={editConvMetricName}
                        onChange={(e) => setEditConvMetricName(e.target.value)}
                        className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      <input
                        type="number"
                        value={editConvMetricValue}
                        onChange={(e) => setEditConvMetricValue(e.target.value)}
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={editConvNotes}
                        onChange={(e) => setEditConvNotes(e.target.value)}
                        placeholder="備考"
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                      <button
                        onClick={handleSaveConversion}
                        className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingConversionId(null)}
                        className="shrink-0 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">{conv.metric_name}</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{conv.metric_value}</span>
                      {conv.notes && <span className="text-xs text-gray-400 truncate max-w-[100px]" title={conv.notes}>{conv.notes}</span>}
                      <button
                        onClick={() => handleStartEditConversion(conv)}
                        className="shrink-0 rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-500 transition-all"
                        title="編集"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteConversion(conv.id)}
                        className="shrink-0 rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                        title="削除"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}
