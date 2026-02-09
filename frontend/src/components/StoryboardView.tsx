import { useState, useEffect } from "react";
import { getVideoSignedUrl } from "../services/videoStorage";
import type { VideoThumbnail, TranscriptionSegment } from "../types";

interface Props {
  thumbnails: VideoThumbnail[];
  segments: TranscriptionSegment[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getSegmentsForTime(
  segments: TranscriptionSegment[],
  time: number,
  nextTime: number | null,
): string {
  const end = nextTime ?? time + 5;
  return segments
    .filter((s) => s.start_time < end && s.end_time > time)
    .map((s) => s.text)
    .join(" ");
}

export default function StoryboardView({ thumbnails, segments }: Props) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map<string, string>();
      for (const thumb of thumbnails) {
        if (cancelled) return;
        try {
          const url = await getVideoSignedUrl(thumb.storage_path, 3600);
          map.set(thumb.storage_path, url);
        } catch { /* skip */ }
      }
      if (!cancelled) {
        setUrls(map);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [thumbnails]);

  if (thumbnails.length === 0) {
    return (
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-8 text-center">
        <p className="text-sm text-gray-400 dark:text-gray-500">サムネイルがありません</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">サムネイルを読み込み中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <svg className="h-5 w-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          コマ割りビュー（{thumbnails.length}フレーム）
        </h3>
        <span className="rounded-full bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 text-xs font-medium text-purple-700 dark:text-purple-300">
          アーカイブ済み
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {thumbnails.map((thumb, i) => {
          const nextTime = i < thumbnails.length - 1 ? thumbnails[i + 1].time : null;
          const text = getSegmentsForTime(segments, thumb.time, nextTime);
          const url = urls.get(thumb.storage_path);

          return (
            <div
              key={thumb.storage_path}
              className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800 shadow-sm"
            >
              <div className="relative aspect-video bg-gray-100 dark:bg-gray-900">
                {url ? (
                  <img
                    src={url}
                    alt={`${formatTime(thumb.time)}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-xs text-gray-400">読み込めません</span>
                  </div>
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-mono text-white">
                  {formatTime(thumb.time)}
                </span>
              </div>
              {text && (
                <div className="px-3 py-2">
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-3">
                    {text}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
