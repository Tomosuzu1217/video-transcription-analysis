import re
import uuid
import subprocess
import json
import logging
import mimetypes
from pathlib import Path, PurePosixPath
from urllib.parse import quote
import aiofiles
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException, Response
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings, get_allowed_extensions, ALLOWED_AUDIO_EXTENSIONS
from app.models import Video
from app.schemas.video import VideoResponse, VideoListResponse, RankingUpdate
from app.services.transcription_service import enqueue_transcription

logger = logging.getLogger(__name__)


class VideoUpdate(BaseModel):
    filename: str


router = APIRouter(tags=["videos"])

_UNSAFE_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _sanitize_filename(raw: str) -> str:
    """Strip path components and dangerous characters from user-supplied filenames."""
    # Take only the final component regardless of OS-style path separators
    name = PurePosixPath(raw.replace("\\", "/")).name
    name = _UNSAFE_CHARS.sub("_", name)
    # Limit length
    if len(name) > 200:
        stem, ext = name.rsplit(".", 1) if "." in name else (name, "")
        name = stem[: 200 - len(ext) - 1] + "." + ext if ext else stem[:200]
    return name or "video"


class UploadResult(BaseModel):
    successes: list[VideoResponse]
    errors: list[dict]


def _is_audio_filepath(filepath: Path) -> bool:
    return filepath.suffix.lower() in ALLOWED_AUDIO_EXTENSIONS


def _probe_media(filepath: str) -> dict:
    """Return basic ffprobe metadata for stream-aware media handling."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                filepath,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.warning(f"ffprobe failed (exit {result.returncode}) for {filepath}: {result.stderr[:200]}")
            return {}

        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        duration = None
        try:
            duration = float(data["format"]["duration"])
        except (KeyError, TypeError, ValueError):
            duration = None

        return {
            "has_audio": any(stream.get("codec_type") == "audio" for stream in streams),
            "has_video": any(stream.get("codec_type") == "video" for stream in streams),
            "duration": duration,
        }
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timed out for {filepath}")
    except FileNotFoundError:
        logger.error("ffprobe not found on system PATH")
    except json.JSONDecodeError as e:
        logger.warning(f"ffprobe output parse error for {filepath}: {e}")
    except Exception as e:
        logger.warning(f"Unexpected ffprobe error for {filepath}: {e}")
    return {}


def _prepare_transcription_media(filepath: Path) -> tuple[Path, float | None]:
    """
    Normalize uploads into a speech-friendly audio file.

    When STORE_AUDIO_ONLY is enabled, the original upload is removed after
    a mono 16k mp3 file is created so only the transcription source audio remains.
    """
    probe = _probe_media(str(filepath))
    duration = probe.get("duration")
    has_audio = bool(probe.get("has_audio"))

    if not has_audio:
        raise RuntimeError("音声トラックを検出できませんでした。音声付きの動画または音声ファイルをアップロードしてください。")

    if not settings.STORE_AUDIO_ONLY:
        return filepath, duration

    prepared_path = filepath.with_suffix(".mp3")
    if prepared_path == filepath:
        prepared_path = filepath.with_name(f"{filepath.stem}_normalized.mp3")
    timeout_seconds = min(7200, max(300, int(duration // 2) if duration else 300))

    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", str(filepath),
                "-vn",
                "-ac", "1",
                "-ar", str(settings.TRANSCRIPTION_AUDIO_SAMPLE_RATE),
                "-c:a", "libmp3lame",
                "-b:a", f"{settings.TRANSCRIPTION_AUDIO_BITRATE_KBPS}k",
                str(prepared_path),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("音声抽出がタイムアウトしました。より短いファイルで再試行してください。") from e
    except FileNotFoundError as e:
        raise RuntimeError("ffmpeg が見つかりません。音声のみ保持モードには ffmpeg が必要です。") from e

    if result.returncode != 0 or not prepared_path.exists() or prepared_path.stat().st_size == 0:
        if prepared_path.exists():
            prepared_path.unlink(missing_ok=True)
        stderr = (result.stderr or "")[:300]
        raise RuntimeError(f"音声抽出に失敗しました: {stderr}")

    filepath.unlink(missing_ok=True)
    prepared_probe = _probe_media(str(prepared_path))
    prepared_duration = prepared_probe.get("duration")
    return prepared_path, prepared_duration or duration


@router.post("/videos/upload", response_model=UploadResult)
async def upload_videos(files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="一度にアップロードできるファイルは20件までです")

    successes: list[Video] = []
    errors: list[dict] = []
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    allowed_extensions = get_allowed_extensions()

    for file in files:
        safe_name = _sanitize_filename(file.filename or "video")
        filepath = None
        prepared_filepath = None
        try:
            # Validate file extension
            ext = Path(safe_name).suffix.lower()
            if ext not in allowed_extensions:
                errors.append({
                    "filename": safe_name,
                    "error": f"非対応のファイル形式です: {ext}（対応形式: {', '.join(sorted(allowed_extensions))}）",
                })
                continue

            # Generate unique filename
            unique_name = f"{uuid.uuid4()}{ext}"
            filepath = upload_dir / unique_name

            # Save file with streaming size check (abort early if too large)
            bytes_written = 0
            async with aiofiles.open(filepath, "wb") as f:
                while chunk := await file.read(256 * 1024):
                    bytes_written += len(chunk)
                    if bytes_written > max_bytes:
                        break
                    await f.write(chunk)

            if bytes_written > max_bytes:
                filepath.unlink()
                filepath = None
                errors.append({
                    "filename": safe_name,
                    "error": f"ファイルサイズが上限({settings.MAX_FILE_SIZE_MB}MB)を超えています",
                })
                continue


            # Validate file content with ffprobe (checks if it's a real media file)
            duration = _get_media_duration(str(filepath))
            if duration is None:
                # ffprobe couldn't parse it — likely not a valid media file
                logger.warning(f"ffprobe could not read file: {safe_name}")

            prepared_filepath, duration = _prepare_transcription_media(filepath)
            filepath = prepared_filepath
            file_size = filepath.stat().st_size

            video = Video(
                filename=safe_name,
                filepath=str(filepath),
                file_size=file_size,
                duration_seconds=duration,
                status="uploaded",
            )
            db.add(video)
            db.commit()
            db.refresh(video)

            # Enqueue transcription
            enqueue_transcription(video.id, str(filepath))
            successes.append(video)

        except Exception as e:
            logger.exception(f"Upload failed for {safe_name}")
            if filepath and filepath.exists():
                filepath.unlink()
            if prepared_filepath and prepared_filepath.exists():
                prepared_filepath.unlink()
            errors.append({
                "filename": safe_name,
                "error": str(e)[:200],
            })

    if not successes and errors:
        raise HTTPException(status_code=400, detail=errors[0]["error"])

    return UploadResult(successes=successes, errors=errors)


@router.get("/videos/allowed-extensions")
def list_allowed_extensions():
    """Return currently allowed file extensions for frontend validation."""
    exts = get_allowed_extensions()
    return {"extensions": sorted(exts), "max_file_size_mb": settings.MAX_FILE_SIZE_MB}


@router.get("/videos", response_model=VideoListResponse)
def list_videos(
    page: int = 1,
    per_page: int = 30,
    db: Session = Depends(get_db),
):
    total = db.query(Video).count()
    videos = (
        db.query(Video)
        .order_by(Video.created_at.desc())
        .offset((max(page, 1) - 1) * per_page)
        .limit(per_page)
        .all()
    )
    return VideoListResponse(videos=videos, total=total)


@router.get("/videos/{video_id}", response_model=VideoResponse)
def get_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")
    return video


@router.patch("/videos/{video_id}", response_model=VideoResponse)
def update_video(video_id: int, data: VideoUpdate, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    if not data.filename.strip():
        raise HTTPException(status_code=400, detail="ファイル名を入力してください")

    video.filename = data.filename.strip()
    db.commit()
    db.refresh(video)
    return video


@router.delete("/videos/{video_id}")
def delete_video(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    # Delete file
    filepath = Path(video.filepath)
    if filepath.exists():
        filepath.unlink()
    thumb_path = Path(settings.UPLOAD_DIR) / "thumbnails" / f"{video.id}.jpg"
    if thumb_path.exists():
        thumb_path.unlink()

    db.delete(video)
    db.commit()
    return {"message": "動画を削除しました"}


@router.put("/videos/{video_id}/ranking", response_model=VideoResponse)
def update_video_ranking(video_id: int, data: RankingUpdate, db: Session = Depends(get_db)):
    """Update video ranking (1 = best)."""
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    if data.ranking is not None:
        if data.ranking < 1:
            raise HTTPException(status_code=400, detail="ランキングは1以上の数値で指定してください")
        video.ranking = data.ranking

    if data.ranking_notes is not None:
        video.ranking_notes = data.ranking_notes.strip() if data.ranking_notes else None

    db.commit()
    db.refresh(video)
    return video


@router.get("/videos/ranked")
def get_ranked_videos(db: Session = Depends(get_db)):
    """Get all videos with ranking, ordered by ranking (best first)."""
    videos = (
        db.query(Video)
        .filter(Video.ranking.isnot(None))
        .order_by(Video.ranking.asc())
        .all()
    )
    return {"videos": videos, "total": len(videos)}


@router.get("/videos/{video_id}/stream")
def stream_video(video_id: int, request: Request, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    filepath = Path(video.filepath)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="動画ファイルが見つかりません")

    content_type, _ = mimetypes.guess_type(str(filepath))
    if not content_type or not (content_type.startswith("video/") or content_type.startswith("audio/")):
        ext = filepath.suffix.lower()
        content_type = "audio/mpeg" if ext in ALLOWED_AUDIO_EXTENSIONS else "video/mp4"

    file_size = filepath.stat().st_size
    range_header = request.headers.get("range")

    # URL-encode filename for Content-Disposition header
    encoded_filename = quote(video.filename, safe='')

    if range_header:
        # Parse Range: bytes=start-end
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not range_match:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        start = int(range_match.group(1))
        end = int(range_match.group(2)) if range_match.group(2) else file_size - 1
        end = min(end, file_size - 1)
        if start > end or start >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")
        chunk_size = end - start + 1

        # Read the requested range directly
        with open(filepath, "rb") as f:
            f.seek(start)
            data = f.read(chunk_size)

        return Response(
            content=data,
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_size),
                "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
            },
        )

    # No Range header: full file response
    return FileResponse(
        path=str(filepath),
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        },
    )


@router.get("/videos/{video_id}/thumbnail")
def get_thumbnail(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    filepath = Path(video.filepath)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="動画ファイルが見つかりません")

    thumb_dir = Path(settings.UPLOAD_DIR) / "thumbnails"
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"{video.id}.jpg"

    # Audio-only files have no video stream for thumbnails
    if _is_audio_filepath(filepath):
        raise HTTPException(status_code=404, detail="音声ファイルにはサムネイルがありません")

    if not thumb_path.exists():
        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(filepath),
                    "-ss", "1", "-vframes", "1",
                    "-vf", "scale=320:-1",
                    "-q:v", "5",
                    str(thumb_path),
                ],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode != 0:
                logger.warning(f"ffmpeg thumbnail failed for video {video_id}: {result.stderr[:300]}")
        except subprocess.TimeoutExpired:
            logger.warning(f"ffmpeg thumbnail timed out for video {video_id}")
            raise HTTPException(status_code=500, detail="サムネイル生成がタイムアウトしました")
        except FileNotFoundError:
            logger.error("ffmpeg not found on system PATH")
            raise HTTPException(status_code=500, detail="ffmpegが見つかりません。インストールしてください。")
        except Exception as e:
            logger.exception(f"Thumbnail generation error for video {video_id}")
            raise HTTPException(status_code=500, detail="サムネイル生成に失敗しました")

    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="サムネイルが生成できませんでした")

    return FileResponse(str(thumb_path), media_type="image/jpeg")


def _get_media_duration(filepath: str) -> float | None:
    """Extract duration from any media file using ffprobe."""
    return _probe_media(filepath).get("duration")

    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data["format"]["duration"])
        else:
            logger.warning(f"ffprobe failed (exit {result.returncode}) for {filepath}: {result.stderr[:200]}")
    except subprocess.TimeoutExpired:
        logger.warning(f"ffprobe timed out for {filepath}")
    except FileNotFoundError:
        logger.error("ffprobe not found on system PATH — duration extraction disabled")
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning(f"ffprobe output parse error for {filepath}: {e}")
    except Exception as e:
        logger.warning(f"Unexpected error getting duration for {filepath}: {e}")
    return None
