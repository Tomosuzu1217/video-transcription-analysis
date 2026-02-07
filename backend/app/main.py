import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.config import settings
from app.database import engine, Base
from app.routers import videos, transcriptions, conversions, analysis
from app.routers import settings as settings_router

logger = logging.getLogger(__name__)


# ── Security headers middleware (pure ASGI to avoid StreamingResponse issues) ──
class SecurityHeadersMiddleware:
    """Pure ASGI middleware that adds security headers without buffering response body."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Skip security headers for streaming endpoints to avoid issues
        path = scope.get("path", "")
        if "/stream" in path or "/thumbnail" in path:
            await self.app(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"x-xss-protection", b"1; mode=block"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                ])
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_wrapper)


# ── Lifespan: startup / shutdown ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

    # Seed API keys from .env if DB has none
    _seed_api_keys_from_env()

    # Re-enqueue incomplete transcriptions from previous session
    _requeue_incomplete_transcriptions()

    # Preload heavy ML models in background to avoid first-request stall
    import threading

    def _preload():
        try:
            from app.services.transcription_service import get_model
            logger.info("Preloading Whisper model...")
            get_model()
            logger.info("Whisper model ready")
        except Exception as e:
            logger.warning(f"Whisper model preload failed (will retry on first use): {e}")
        try:
            from app.services.nlp_service import get_tagger
            logger.info("Preloading NLP tagger...")
            get_tagger()
            logger.info("NLP tagger ready")
        except Exception as e:
            logger.warning(f"NLP tagger preload failed: {e}")

    threading.Thread(target=_preload, daemon=True).start()

    yield


def _requeue_incomplete_transcriptions():
    """Re-enqueue videos left in uploaded/transcribing state from a previous session."""
    from app.database import SessionLocal
    from app.models import Video
    from app.services.transcription_service import enqueue_transcription

    db = SessionLocal()
    try:
        stuck = db.query(Video).filter(Video.status.in_(["uploaded", "transcribing"])).all()
        for v in stuck:
            try:
                v.status = "uploaded"
                db.commit()
                enqueue_transcription(v.id, v.filepath)
                logger.info(f"Re-enqueued transcription for video {v.id} ({v.filename})")
            except Exception as e:
                db.rollback()
                logger.warning(f"Failed to re-enqueue video {v.id}: {e}")
    except Exception as e:
        logger.warning(f"Failed to query incomplete transcriptions: {e}")
    finally:
        db.close()


def _seed_api_keys_from_env():
    """If no API keys in DB yet, seed from .env settings."""
    import json
    from app.database import SessionLocal
    from app.models.app_setting import AppSetting

    db = SessionLocal()
    try:
        existing = db.query(AppSetting).filter(AppSetting.key == "gemini_api_keys").first()
        if existing:
            return

        keys = []
        # Support comma-separated GEMINI_API_KEYS
        if settings.GEMINI_API_KEYS:
            keys = [k.strip() for k in settings.GEMINI_API_KEYS.split(",") if k.strip()]
        # Fallback to single GEMINI_API_KEY
        if not keys and settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_api_key_here":
            keys = [settings.GEMINI_API_KEY]

        if keys:
            db.add(AppSetting(key="gemini_api_keys", value=json.dumps(keys)))
            db.commit()
            logger.info(f"Seeded {len(keys)} API key(s) from .env")

        # Seed model setting
        existing_model = db.query(AppSetting).filter(AppSetting.key == "gemini_model").first()
        if not existing_model and settings.GEMINI_MODEL:
            db.add(AppSetting(key="gemini_model", value=settings.GEMINI_MODEL))
            db.commit()
    finally:
        db.close()


app = FastAPI(title="動画CM分析", version="1.0.0", lifespan=lifespan)

# Security headers (added first so it wraps everything)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(videos.router, prefix="/api")
app.include_router(transcriptions.router, prefix="/api")
app.include_router(conversions.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")


@app.get("/api/health")
def health_check():
    from app.services.transcription_service import get_queue_status
    status = get_queue_status()
    return {
        "status": "ok",
        "whisper_model_loaded": status["model_loaded"],
        "transcription_queue_size": status["queue_size"],
    }
