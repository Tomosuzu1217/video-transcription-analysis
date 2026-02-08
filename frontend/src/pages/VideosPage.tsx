import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { uploadVideos, getVideos, deleteVideo, getVideoThumbnailUrl } from "../api/videos";
import { batchTranscribeVideos } from "../api/transcriptions";
import BatchProgressPanel from "../components/BatchProgressPanel";
import Toast, { useToast } from "../components/Toast";
import { useRealtimeVideos } from "../hooks/useRealtimeVideos";
import { formatFileSize, formatDuration, formatDate } from "../utils/format";
import { exportVideoListCSV } from "../utils/csv";
import type { Video, BatchProgress } from "../types";

export default function VideosPage() {
  const navigate = useNavigate();

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileNames, setUploadFileNames] = useState<string[]>([]);
  const { toast, showToast, clearToast } = useToast();
  const [page, setPage] = useState(1);
  const [totalVideos, setTotalVideos] = useState(0);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const perPage = 30;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelBatchRef = useRef<(() => void) | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const data = await getVideos(page, perPage);
      setVideos(data.videos);
      setTotalVideos(data.total);
      setError(null);
    } catch (err) {
      setError("動画一覧の取得に失敗しました。");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Realtime sync: refresh when other users change videos
  useRealtimeVideos(useCallback(() => { fetchVideos(); }, [fetchVideos]));

  // Poll video list when batch is running (to refresh statuses)
  useEffect(() => {
    const hasPending = videos.some(
      (v) => v.status === "uploaded" || v.status === "transcribing"
    );

    if (hasPending && !batchProgress?.isRunning) {
      // If videos are pending but no batch is running, poll to detect external changes
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => {
          fetchVideos();
        }, 5000);
      }
    } else if (!hasPending) {
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
  }, [videos, fetchVideos, batchProgress?.isRunning]);

  const handleUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    try {
      setUploading(true);
      setUploadProgress(0);
      setUploadFileNames(fileArray.map((f) => f.name));
      setUploadStatus(`${fileArray.length}件のファイルをアップロード中...`);
      setError(null);
      const result = await uploadVideos(fileArray, (percent) => setUploadProgress(percent));
      setUploadStatus(null);
      setUploadProgress(null);
      setUploadFileNames([]);
      const ok = result.successes.length;
      const ng = result.errors.length;
      if (ng > 0 && ok > 0) {
        showToast( `${ok}件成功、${ng}件失敗: ${result.errors[0].error}`, "error");
      } else if (ng > 0) {
        showToast( `アップロード失敗: ${result.errors[0].error}`, "error");
      } else {
        showToast( `${ok}件のアップロードが完了しました`, "success");
      }
      await fetchVideos();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      showToast( detail ?? "アップロードに失敗しました", "error");
      setUploadStatus(null);
      setUploadProgress(null);
      setUploadFileNames([]);
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
      e.target.value = "";
    }
  };

  const handleDelete = async (e: React.MouseEvent, video: Video) => {
    e.stopPropagation();
    if (!window.confirm(`「${video.filename}」を削除してもよろしいですか？`)) return;

    try {
      await deleteVideo(video.id);
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
      showToast( `「${video.filename}」を削除しました`, "success");
    } catch (err) {
      showToast( "動画の削除に失敗しました", "error");
      console.error(err);
    }
  };

  const handleBatchTranscribe = async () => {
    const pendingIds = videos
      .filter((v) => v.status === "uploaded" || v.status === "error")
      .map((v) => v.id);

    if (pendingIds.length === 0) {
      showToast( "書き起こし対象の動画がありません", "error");
      return;
    }

    try {
      const handle = await batchTranscribeVideos(pendingIds, (progress) => {
        setBatchProgress(progress);
        if (!progress.isRunning) {
          fetchVideos();
          cancelBatchRef.current = null;
        }
      });
      cancelBatchRef.current = handle.cancel;
    } catch (err: any) {
      showToast( err.message ?? "バッチ処理の開始に失敗しました", "error");
    }
  };

  const handleCancelBatch = () => {
    if (cancelBatchRef.current) {
      cancelBatchRef.current();
      showToast( "バッチ処理をキャンセルしています...", "success");
    }
  };

  const getStatusBadge = (status: Video["status"]) => {
    switch (status) {
      case "uploaded":
        return { className: "bg-gray-100 text-gray-700", label: "アップロード済" };
      case "transcribing":
        return {
          className: "bg-yellow-100 text-yellow-700 animate-pulse",
          label: "書き起こし中",
        };
      case "transcribed":
        return { className: "bg-green-100 text-green-700", label: "書き起こし完了" };
      case "error":
        return { className: "bg-red-100 text-red-700", label: "エラー" };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">動画管理</h2>
        {videos.length > 0 && (
          <button
            onClick={() => exportVideoListCSV(videos)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            CSVエクスポート
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-lg mx-auto">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
            <p className="text-sm font-medium text-blue-700">{uploadStatus}</p>
            {uploadProgress !== null && (
              <div className="w-full">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">アップロード進捗</span>
                  <span className="text-xs font-semibold text-blue-600">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
            {uploadFileNames.length > 0 && (
              <div className="w-full mt-1">
                <p className="text-xs text-gray-500 mb-1">対象ファイル:</p>
                <ul className="space-y-0.5">
                  {uploadFileNames.map((name, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                      <svg className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <svg
                className="h-6 w-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-600">
              ここに動画・音声ファイルをドラッグ＆ドロップ
            </p>
            <p className="mt-1 text-xs text-gray-400">または</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              ファイルを選択
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,audio/*,.mp3,.wav,.aac,.ogg,.flac,.wma,.m4a,.opus"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            {uploadStatus && (
              <p className="mt-3 text-sm font-medium text-green-600">{uploadStatus}</p>
            )}
          </>
        )}
      </div>

      {/* Batch progress panel */}
      {batchProgress && batchProgress.isRunning && (
        <BatchProgressPanel
          progress={batchProgress}
          onCancel={handleCancelBatch}
        />
      )}

      {/* Batch completed summary */}
      {batchProgress && !batchProgress.isRunning && batchProgress.completedVideos > 0 && (
        <div className="rounded-xl bg-green-50 border border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-sm font-medium text-green-800">
                一括書き起こし完了: {batchProgress.completedVideos}/{batchProgress.totalVideos}件成功
                {batchProgress.errorVideos > 0 && `, ${batchProgress.errorVideos}件エラー`}
              </span>
            </div>
            <button
              onClick={() => setBatchProgress(null)}
              className="text-xs text-green-600 hover:text-green-800"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Auto-transcribe button */}
      {!batchProgress?.isRunning && videos.some((v) => v.status === "uploaded" || v.status === "error") && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-5 py-3">
          <div>
            <p className="text-sm font-medium text-amber-800">
              {videos.filter((v) => v.status === "uploaded" || v.status === "error").length}件の動画が書き起こし待ちです
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              複数のAPIキーが設定されている場合、並列処理で高速に書き起こします
            </p>
          </div>
          <button
            onClick={handleBatchTranscribe}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors shrink-0 ml-4"
          >
            一括書き起こし
          </button>
        </div>
      )}

      {/* Search / filter */}
      {videos.length > 0 && (
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ファイル名で検索..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-colors"
          />
        </div>
      )}

      {/* Video grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
            <p className="mt-3 text-gray-500">読み込み中...</p>
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-xl bg-white border border-gray-100 p-12 text-center shadow-sm">
          <p className="text-gray-400">動画がまだありません。上のエリアからアップロードしてください。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos
            .filter((v) =>
              searchQuery === "" || v.filename.toLowerCase().includes(searchQuery.toLowerCase())
            )
            .map((video) => {
            const badge = getStatusBadge(video.status);
            return (
              <div
                key={video.id}
                onClick={() => navigate(`/videos/${video.id}`)}
                className="group relative cursor-pointer rounded-xl bg-white border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(e, video)}
                  className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 transition-all"
                  title="削除"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>

                {/* Thumbnail */}
                <div className="mb-3 -mx-5 -mt-5 rounded-t-xl overflow-hidden bg-gray-100">
                  <img
                    src={getVideoThumbnailUrl(video.id)}
                    alt=""
                    className="w-full h-32 object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>

                {/* Filename */}
                <h3
                  className="mb-3 pr-8 text-sm font-semibold text-gray-900 truncate"
                  title={video.filename}
                >
                  {video.filename}
                </h3>

                {/* Ranking badge */}
                {video.ranking && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 border border-yellow-300 px-2.5 py-0.5 text-xs font-bold text-yellow-800">
                      🏆 {video.ranking}位
                    </span>
                  </div>
                )}

                {/* Status badge */}
                <div className="mb-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                {/* Meta info */}
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>ファイルサイズ</span>
                    <span className="font-medium text-gray-700">
                      {formatFileSize(video.file_size)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>再生時間</span>
                    <span className="font-medium text-gray-700">
                      {formatDuration(video.duration_seconds)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>アップロード日</span>
                    <span className="font-medium text-gray-700">
                      {formatDate(video.created_at)}
                    </span>
                  </div>
                </div>

                {/* Error message */}
                {video.status === "error" && video.error_message && (
                  <p className="mt-3 rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600 line-clamp-2">
                    {video.error_message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalVideos > perPage && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            前へ
          </button>
          <span className="text-sm text-gray-600">
            {page} / {Math.ceil(totalVideos / perPage)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(totalVideos / perPage)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            次へ
          </button>
        </div>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}
