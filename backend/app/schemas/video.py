from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class VideoBase(BaseModel):
    filename: str


class VideoCreate(VideoBase):
    pass


class VideoResponse(VideoBase):
    id: int
    file_size: Optional[int] = None
    duration_seconds: Optional[float] = None
    status: str
    error_message: Optional[str] = None
    ranking: Optional[int] = None
    ranking_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VideoListResponse(BaseModel):
    videos: list[VideoResponse]
    total: int


class RankingUpdate(BaseModel):
    ranking: Optional[int] = None
    ranking_notes: Optional[str] = None
