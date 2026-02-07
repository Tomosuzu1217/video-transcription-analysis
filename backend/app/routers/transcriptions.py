import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Video, Transcription
from app.models.transcription import TranscriptionSegment
from app.schemas.transcription import TranscriptionResponse, TranscriptionStatusResponse
from app.services.transcription_service import enqueue_transcription, get_queue_status, get_video_queue_position

router = APIRouter(tags=["transcriptions"])


@router.get("/transcriptions/queue-status")
def transcription_queue_status():
    """Return current transcription processing queue status."""
    return get_queue_status()


@router.get("/transcriptions/all")
def get_all_transcriptions(
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """Get all transcriptions with their segments for viewing."""
    from sqlalchemy.orm import joinedload

    videos = (
        db.query(Video)
        .options(joinedload(Video.transcription))
        .filter(Video.status == "transcribed")
        .order_by(Video.created_at.desc())
        .limit(limit)
        .all()
    )

    results = []
    for video in videos:
        if video.transcription:
            segments = (
                db.query(TranscriptionSegment)
                .filter(TranscriptionSegment.transcription_id == video.transcription.id)
                .order_by(TranscriptionSegment.start_time)
                .all()
            )
            results.append({
                "video_id": video.id,
                "video_filename": video.filename,
                "duration_seconds": video.duration_seconds,
                "full_text": video.transcription.full_text,
                "language": video.transcription.language,
                "segments": [
                    {
                        "id": seg.id,
                        "start_time": seg.start_time,
                        "end_time": seg.end_time,
                        "text": seg.text,
                    }
                    for seg in segments
                ],
            })

    return {"total": len(results), "transcriptions": results}


@router.get("/transcriptions/search")
def search_transcriptions(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Search across all transcription segments for matching text."""
    from sqlalchemy.orm import joinedload

    base_query = (
        db.query(TranscriptionSegment)
        .options(joinedload(TranscriptionSegment.transcription).joinedload(Transcription.video))
        .filter(TranscriptionSegment.text.contains(q))
    )
    total = base_query.count()
    segments = base_query.offset(offset).limit(limit).all()

    results = []
    for seg in segments:
        video = seg.transcription.video
        results.append({
            "video_id": video.id,
            "video_filename": video.filename,
            "segment_id": seg.id,
            "start_time": seg.start_time,
            "end_time": seg.end_time,
            "text": seg.text,
        })

    return {"query": q, "total": total, "results": results}


@router.get("/transcriptions/{video_id}", response_model=TranscriptionStatusResponse)
def get_transcription(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    status_map = {
        "uploaded": "pending",
        "transcribing": "transcribing",
        "transcribed": "completed",
        "error": "error",
    }

    transcription = None
    if video.transcription:
        transcription = video.transcription

    return TranscriptionStatusResponse(
        video_id=video_id,
        status=status_map.get(video.status, video.status),
        transcription=transcription,
    )


@router.post("/transcriptions/{video_id}/retry")
def retry_transcription(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    if video.status not in ("error", "uploaded"):
        raise HTTPException(status_code=400, detail="書き起こし可能な状態ではありません")

    # Delete existing transcription if any
    if video.transcription:
        db.delete(video.transcription)
        db.commit()

    video.status = "uploaded"
    video.error_message = None
    db.commit()

    enqueue_transcription(video.id, video.filepath)
    return {"message": "書き起こしを再開しました"}


@router.get("/transcriptions/{video_id}/export")
def export_transcription(
    video_id: int,
    format: str = Query("txt", pattern="^(txt|srt|vtt|json)$"),
    db: Session = Depends(get_db),
):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    if not video.transcription:
        raise HTTPException(status_code=404, detail="書き起こしデータがありません")

    transcription = video.transcription
    safe_name = video.filename.rsplit(".", 1)[0] if "." in video.filename else video.filename

    # Format registry — easy to extend with new formats
    formatters = {
        "txt": _export_txt,
        "srt": _export_srt,
        "vtt": _export_vtt,
        "json": _export_json,
    }
    content, ext, media_type = formatters[format](transcription, safe_name)

    return PlainTextResponse(
        content=content,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}{ext}"',
        },
        media_type=media_type,
    )


def _export_txt(transcription, safe_name: str) -> tuple[str, str, str]:
    return transcription.full_text, ".txt", "text/plain; charset=utf-8"


def _export_srt(transcription, safe_name: str) -> tuple[str, str, str]:
    lines = []
    for i, seg in enumerate(transcription.segments, start=1):
        start_srt = _seconds_to_srt_time(seg.start_time)
        end_srt = _seconds_to_srt_time(seg.end_time)
        lines.append(f"{i}")
        lines.append(f"{start_srt} --> {end_srt}")
        lines.append(seg.text.strip())
        lines.append("")
    return "\n".join(lines), ".srt", "text/plain; charset=utf-8"


def _export_vtt(transcription, safe_name: str) -> tuple[str, str, str]:
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(transcription.segments, start=1):
        start_vtt = _seconds_to_vtt_time(seg.start_time)
        end_vtt = _seconds_to_vtt_time(seg.end_time)
        lines.append(f"{i}")
        lines.append(f"{start_vtt} --> {end_vtt}")
        lines.append(seg.text.strip())
        lines.append("")
    return "\n".join(lines), ".vtt", "text/vtt; charset=utf-8"


def _export_json(transcription, safe_name: str) -> tuple[str, str, str]:
    data = {
        "full_text": transcription.full_text,
        "language": transcription.language,
        "model_used": transcription.model_used,
        "segments": [
            {
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "text": seg.text.strip(),
            }
            for seg in transcription.segments
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2), ".json", "application/json; charset=utf-8"


def _seconds_to_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _seconds_to_vtt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
