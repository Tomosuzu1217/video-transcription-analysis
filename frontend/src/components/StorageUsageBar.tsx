import { formatFileSize } from "../utils/format";

interface StorageUsageBarProps {
  usedBytes: number;
  limitBytes: number;
}

export default function StorageUsageBar({ usedBytes, limitBytes }: StorageUsageBarProps) {
  const percent = Math.min((usedBytes / limitBytes) * 100, 100);
  const colorClass =
    percent >= 80
      ? "bg-red-500"
      : percent >= 50
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          ストレージ使用量
        </span>
        <span className="text-gray-500 dark:text-gray-400">
          {formatFileSize(usedBytes)} / {formatFileSize(limitBytes)}{" "}
          <span className="font-medium">({percent.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {percent >= 80 && (
        <p className="text-xs text-red-600 dark:text-red-400">
          ストレージ容量が残りわずかです。不要な動画を削除してください。
        </p>
      )}
    </div>
  );
}
