import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteVideo,
  getVideoThumbnailUrl,
  getVideos,
  updateVideoTags,
  uploadVideos,
} from "../api/videos";
import { batchTranscribeVideos } from "../api/transcriptions";
import { getManagedTags } from "../api/settings";
import { getAllAdPerformance } from "../api/adPerformance";
import BatchProgressPanel from "../components/BatchProgressPanel";
import TagMultiSelect from "../components/TagMultiSelect";
import Toast from "../components/Toast";
import { useToast } from "../components/useToast";
import { useRealtimeVideos } from "../hooks/useRealtimeVideos";
import { exportVideoListCSV } from "../utils/csv";
import { formatDate, formatDuration, formatFileSize } from "../utils/format";
import { getErrorMessage } from "../utils/errors";
import type { BatchProgress, Video } from "../types";

function getStatusMeta(status: Video["status"]) {
  switch (status) {
    case "uploaded":
      return { label: "アップロード済み", className: "bg-gray-100 text-gray-700" };
    case "transcribing":
      return { label: "文字起こし中", className: "bg-yellow-100 text-yellow-700" };
    case "transcribed":
      return { label: "文字起こし済み", className: "bg-green-100 text-green-700" };
    case "error":
      return { label: "エラー", className: "bg-red-100 text-red-700" };
    case "archived":
      return { label: "アーカイブ", className: "bg-amber-100 text-amber-700" };
  }
}

export default function VideosPage() {
  const navigate = useNavigate();
  const { toast, showToast, clearToast } = useToast();

  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadFileNames, setUploadFileNames] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [managedTags, setManagedTags] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);

  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingCodes, setPendingCodes] = useState<string[]>([]);
  const [adCodes, setAdCodes] = useState<string[]>([]); // 既存の広告実績コード一覧

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelBatchRef = useRef<(() => void) | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getVideos(1, 1000);
      setVideos(data.videos);
      setError(null);
    } catch (fetchError) {
      setError(getErrorMessage(fetchError, "動画一覧の取得に失敗しました。"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const tags = await getManagedTags();
      setManagedTags(tags);
    } catch {
      setManagedTags([]);
    }
  }, []);

  const fetchAdCodes = useCallback(async () => {
    try {
      const list = await getAllAdPerformance();
      setAdCodes(list.map((r) => r.code).filter(Boolean).sort());
    } catch {
      setAdCodes([]);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchTags();
    fetchAdCodes();
  }, [fetchTags, fetchVideos, fetchAdCodes]);

  useRealtimeVideos(
    useCallback(() => {
      fetchVideos();
    }, [fetchVideos]),
  );

  const filteredVideos = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return videos.filter((video) => {
      const matchQuery = !query || video.filename.toLowerCase().includes(query);
      const matchTag = !tagFilter || (video.tags ?? []).includes(tagFilter);
      return matchQuery && matchTag;
    });
  }, [searchQuery, tagFilter, videos]);

  const pendingVideos = useMemo(
    () => videos.filter((video) => video.status === "uploaded" || video.status === "error" || video.status === "transcribing"),
    [videos],
  );

  const handleFilesSelected = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setPendingFiles(fileArray);
    setPendingCodes(fileArray.map(() => ""));
  };

  const handleUploadStart = async () => {
    if (!pendingFiles || pendingFiles.length === 0) return;

    try {
      setUploading(true);
      setUploadStatus("アップロード中...");
      setUploadProgress(0);
      setUploadFileNames(pendingFiles.map((file) => file.name));
      const result = await uploadVideos(pendingFiles, (percent) => setUploadProgress(percent), pendingCodes);
      const successCount = result.successes.length;
      const errorCount = result.errors.length;

      if (errorCount > 0 && successCount > 0) {
        showToast(`${successCount}件成功、${errorCount}件失敗`, "error");
      } else if (errorCount > 0) {
        showToast(result.errors[0]?.error ?? "アップロードに失敗しました。", "error");
      } else {
        showToast(`${successCount}件のアップロードが完了しました`, "success");
      }

      setPendingFiles(null);
      setPendingCodes([]);
      await fetchVideos();
    } catch (uploadError) {
      showToast(getErrorMessage(uploadError, "アップロードに失敗しました。"), "error");
    } finally {
      setUploading(false);
      setUploadStatus(null);
      setUploadProgress(null);
      setUploadFileNames([]);
    }
  };

  const handleDelete = async (event: React.MouseEvent, video: Video) => {
    event.stopPropagation();
    if (!window.confirm(`"${video.filename}" を削除しますか？`)) return;

    try {
      await deleteVideo(video.id);
      setVideos((prev) => prev.filter((item) => item.id !== video.id));
      showToast(`"${video.filename}" を削除しました`, "success");
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError, "動画の削除に失敗しました。"), "error");
    }
  };

  const handleVideoTagsChange = async (videoId: number, tags: string[]) => {
    try {
      await updateVideoTags(videoId, tags);
      setVideos((prev) => prev.map((video) => (video.id === videoId ? { ...video, tags } : video)));
    } catch (updateError) {
      showToast(getErrorMessage(updateError, "タグの更新に失敗しました。"), "error");
    }
  };

  const handleBatchTranscribe = async () => {
    if (pendingVideos.length === 0) {
      showToast("一括処理の対象動画がありません。", "error");
      return;
    }

    try {
      const handle = await batchTranscribeVideos(
        pendingVideos.map((video) => video.id),
        (progress) => {
          setBatchProgress(progress);
          if (!progress.isRunning) {
            cancelBatchRef.current = null;
            fetchVideos();
          }
        },
      );
      cancelBatchRef.current = handle.cancel;
    } catch (batchError) {
      showToast(getErrorMessage(batchError, "バッチ処理の開始に失敗しました。"), "error");
    }
  };

  const handleCancelBatch = () => {
    cancelBatchRef.current?.();
    showToast("バッチ処理をキャンセルしています。", "success");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">動画一覧</h2>
        {videos.length > 0 && (
          <button
            onClick={() => exportVideoListCSV(videos)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            CSV出力
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Drop zone (hidden during staging or upload) */}
      {!pendingFiles && (
        <div
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            handleFilesSelected(event.dataTransfer.files);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragOver(false);
          }}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
            }`}
        >
          {uploading ? (
            <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
              <p className="text-sm font-medium text-blue-700">{uploadStatus}</p>
              {uploadProgress != null && (
                <div className="w-full">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                    <span>進捗</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                    <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {uploadFileNames.length > 0 && (
                <div className="w-full text-left">
                  <p className="mb-1 text-xs text-gray-500">対象ファイル</p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    {uploadFileNames.map((name) => (
                      <li key={name} className="truncate">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">ここに動画・音声ファイルをドラッグ＆ドロップ</p>
              <p className="mt-1 text-xs text-gray-400">または</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                ファイルを選択
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,audio/*"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) handleFilesSelected(event.target.files);
                  event.target.value = "";
                }}
              />
            </>
          )}
        </div>
      )}

      {/* Staging panel: code input per file */}
      {pendingFiles && !uploading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-900">{pendingFiles.length}件のファイルを選択中</p>
              <p className="text-xs text-blue-600 mt-0.5">各ファイルにコード名を入力するとExcel実績データと紐付けできます（任意）</p>
            </div>
            <button
              onClick={() => { setPendingFiles(null); setPendingCodes([]); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              キャンセル
            </button>
          </div>
          <div className="space-y-2">
            {pendingFiles.map((file, i) => (
              <div key={file.name + i} className="flex items-center gap-3 rounded-lg bg-white border border-blue-100 px-3 py-2">
                <span className="flex-1 truncate text-sm text-gray-700" title={file.name}>{file.name}</span>
                {adCodes.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={pendingCodes[i] ?? ""}
                      onChange={(e) => {
                        const next = [...pendingCodes];
                        next[i] = e.target.value;
                        setPendingCodes(next);
                      }}
                      className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none w-48"
                    >
                      <option value="">コードを選択（任意）</option>
                      {adCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={pendingCodes[i] ?? ""}
                      onChange={(e) => {
                        const next = [...pendingCodes];
                        next[i] = e.target.value;
                        setPendingCodes(next);
                      }}
                      placeholder="または直接入力"
                      className="w-32 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={pendingCodes[i] ?? ""}
                    onChange={(e) => {
                      const next = [...pendingCodes];
                      next[i] = e.target.value;
                      setPendingCodes(next);
                    }}
                    placeholder="コード例: shindan01a312d"
                    className="w-52 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleUploadStart}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              アップロード開始
            </button>
          </div>
        </div>
      )}

      {batchProgress && (
        <BatchProgressPanel progress={batchProgress} onCancel={handleCancelBatch} />
      )}

      {!batchProgress?.isRunning && pendingVideos.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
          <div>
            <p className="text-sm font-medium text-amber-800">{pendingVideos.length}件の動画が処理待ちです</p>
            <p className="text-xs text-amber-600">一括で文字起こしを開始できます。</p>
          </div>
          <button
            onClick={handleBatchTranscribe}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            一括実行
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="ファイル名で検索"
          className="min-w-[240px] flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {managedTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">すべてのタグ</option>
            {managedTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
            <p className="mt-3 text-gray-500">読み込み中...</p>
          </div>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-12 text-center text-gray-400 shadow-sm">
          表示できる動画がありません。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredVideos.map((video) => {
            const status = getStatusMeta(video.status);
            return (
              <div
                key={video.id}
                onClick={() => navigate(`/videos/${video.id}`)}
                className="cursor-pointer rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative overflow-hidden rounded-lg bg-gray-100">
                  <img
                    src={getVideoThumbnailUrl(video.id)}
                    alt={video.filename}
                    className="aspect-video w-full object-cover"
                  />
                  <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                  <button
                    onClick={(event) => handleDelete(event, video)}
                    className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-gray-500 shadow-sm transition hover:bg-white hover:text-red-600"
                    title="削除"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <h3 className="truncate text-sm font-semibold text-gray-900" title={video.filename}>
                      {video.filename}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{formatFileSize(video.file_size)}</span>
                      {video.duration_seconds != null && <span>{formatDuration(video.duration_seconds)}</span>}
                      <span>{formatDate(video.created_at)}</span>
                      {video.code && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-500">
                          {video.code}
                        </span>
                      )}
                    </div>
                  </div>

                  <TagMultiSelect
                    availableTags={managedTags}
                    selectedTags={video.tags ?? []}
                    onChange={(tags) => handleVideoTagsChange(video.id, tags)}
                  />

                  {video.error_message && video.status === "error" && (
                    <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
                      {video.error_message}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Toast toast={toast} onClose={clearToast} />
    </div>
  );
}
