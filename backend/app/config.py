from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./cm_analysis.db"
    UPLOAD_DIR: str = str(Path(__file__).parent.parent / "uploads")
    MAX_FILE_SIZE_MB: int = 500
    WHISPER_MODEL: str = "large-v3"
    WHISPER_LANGUAGE: str = "ja"
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEYS: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    # Comma-separated extra extensions to allow (e.g. ".aif,.caf")
    EXTRA_ALLOWED_EXTENSIONS: str = ""

    class Config:
        env_file = ".env"


settings = Settings()


# ── Supported media extensions ──────────────────────────────────
ALLOWED_VIDEO_EXTENSIONS = {
    ".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm",
    ".m4v", ".mpeg", ".mpg", ".3gp", ".ts", ".mts", ".m2ts",
    ".ogv", ".vob",
}

ALLOWED_AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".aac", ".ogg", ".flac", ".wma", ".m4a", ".opus",
}


def get_allowed_extensions() -> set[str]:
    """Return the full set of allowed media extensions (video + audio + user extras)."""
    extras = set()
    if settings.EXTRA_ALLOWED_EXTENSIONS:
        extras = {e.strip().lower() for e in settings.EXTRA_ALLOWED_EXTENSIONS.split(",") if e.strip()}
    return ALLOWED_VIDEO_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS | extras
