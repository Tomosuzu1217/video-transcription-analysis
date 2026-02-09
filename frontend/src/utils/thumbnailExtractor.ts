const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;
const DEFAULT_INTERVAL = 5;
const JPEG_QUALITY = 0.7;

interface ThumbnailFrame {
  time: number;
  blob: Blob;
}

export async function extractThumbnails(
  videoUrl: string,
  durationSec: number,
  intervalSec = DEFAULT_INTERVAL,
): Promise<ThumbnailFrame[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("動画の読み込みに失敗しました"));
    setTimeout(() => reject(new Error("動画の読み込みがタイムアウトしました")), 30000);
  });

  const canvas = document.createElement("canvas");
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const times: number[] = [];
  for (let t = 0; t < durationSec; t += intervalSec) {
    times.push(Math.round(t * 10) / 10);
  }
  // Ensure at least the first frame
  if (times.length === 0) times.push(0);

  const frames: ThumbnailFrame[] = [];

  for (const time of times) {
    video.currentTime = time;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 3000);
    });

    ctx.drawImage(video, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("フレームの取得に失敗"))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    });

    frames.push({ time, blob });
  }

  // Cleanup
  video.src = "";
  video.load();

  return frames;
}
