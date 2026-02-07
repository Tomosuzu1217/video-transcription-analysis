import whisper
import threading
import time
import logging
from queue import Queue
from app.config import settings
from app.database import SessionLocal
from app.models import Video, Transcription, TranscriptionSegment

logger = logging.getLogger(__name__)

_model = None
_model_loading = False
_task_queue: Queue = Queue()
_worker_thread = None

# Tracking state for progress reporting
_current_video_id: int | None = None
_current_step: str = ""  # "model_loading", "transcribing", ""
_current_start_time: float | None = None
_queue_video_ids: list[int] = []
_lock = threading.Lock()


def get_model():
    global _model, _model_loading
    if _model is None:
        _model_loading = True
        logger.info(f"Loading Whisper model: {settings.WHISPER_MODEL}")
        _model = whisper.load_model(settings.WHISPER_MODEL)
        _model_loading = False
        logger.info("Whisper model loaded")
    return _model


def get_queue_status() -> dict:
    """Return current transcription queue and processing status."""
    with _lock:
        return {
            "model_loaded": _model is not None,
            "model_loading": _model_loading,
            "queue_size": len(_queue_video_ids),
            "queue_video_ids": list(_queue_video_ids),
            "current_video_id": _current_video_id,
            "current_step": _current_step,
            "current_elapsed_seconds": round(time.time() - _current_start_time, 1) if _current_start_time else None,
        }


def get_video_queue_position(video_id: int) -> int | None:
    """Return 0-based position in queue, or None if not queued."""
    with _lock:
        if _current_video_id == video_id:
            return 0
        try:
            return _queue_video_ids.index(video_id) + 1
        except ValueError:
            return None


def _worker():
    global _current_video_id, _current_step, _current_start_time
    while True:
        video_id, filepath = _task_queue.get()
        with _lock:
            _current_video_id = video_id
            _current_start_time = time.time()
            if video_id in _queue_video_ids:
                _queue_video_ids.remove(video_id)
        try:
            _transcribe_video(video_id, filepath)
        except Exception as e:
            logger.exception(f"Transcription failed for video {video_id}")
            _mark_error(video_id, str(e))
        finally:
            with _lock:
                _current_video_id = None
                _current_step = ""
                _current_start_time = None
            _task_queue.task_done()


def enqueue_transcription(video_id: int, filepath: str):
    global _worker_thread
    with _lock:
        _queue_video_ids.append(video_id)
    if _worker_thread is None or not _worker_thread.is_alive():
        _worker_thread = threading.Thread(target=_worker, daemon=True)
        _worker_thread.start()
    _task_queue.put((video_id, filepath))


def _transcribe_video(video_id: int, filepath: str):
    global _current_step
    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if not video:
            return
        video.status = "transcribing"
        db.commit()

        # Step 1: Ensure model is loaded
        with _lock:
            _current_step = "model_loading"
        start = time.time()
        model = get_model()

        # Step 2: Transcribe audio
        with _lock:
            _current_step = "transcribing"
        result = model.transcribe(filepath, language=settings.WHISPER_LANGUAGE, verbose=False)
        elapsed = time.time() - start

        transcription = Transcription(
            video_id=video_id,
            full_text=result["text"],
            language=result.get("language", settings.WHISPER_LANGUAGE),
            model_used=settings.WHISPER_MODEL,
            processing_time_seconds=elapsed,
        )
        db.add(transcription)
        db.flush()

        for seg in result.get("segments", []):
            segment = TranscriptionSegment(
                transcription_id=transcription.id,
                start_time=seg["start"],
                end_time=seg["end"],
                text=seg["text"],
            )
            db.add(segment)

        video.status = "transcribed"
        db.commit()
        logger.info(f"Video {video_id} transcribed in {elapsed:.1f}s")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _mark_error(video_id: int, error_msg: str):
    # Truncate long error messages so they fit in DB and are user-readable
    truncated = error_msg[:500] if len(error_msg) > 500 else error_msg
    db = SessionLocal()
    try:
        video = db.query(Video).filter(Video.id == video_id).first()
        if video:
            video.status = "error"
            video.error_message = truncated
            db.commit()
    except Exception as e:
        logger.error(f"Failed to mark error state for video {video_id}: {e}")
        db.rollback()
    finally:
        db.close()
