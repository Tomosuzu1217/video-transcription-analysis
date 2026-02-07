from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class TranscriptionSegmentResponse(BaseModel):
    id: int
    start_time: float
    end_time: float
    text: str

    class Config:
        from_attributes = True


class TranscriptionResponse(BaseModel):
    id: int
    video_id: int
    full_text: str
    language: str
    model_used: Optional[str] = None
    processing_time_seconds: Optional[float] = None
    created_at: datetime
    segments: list[TranscriptionSegmentResponse]

    class Config:
        from_attributes = True


class TranscriptionStatusResponse(BaseModel):
    video_id: int
    status: str  # "pending", "transcribing", "completed", "error"
    transcription: Optional[TranscriptionResponse] = None
