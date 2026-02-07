from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id"), unique=True, nullable=False)
    full_text = Column(Text, nullable=False)
    language = Column(String(10), default="ja")
    model_used = Column(String(50), nullable=True)
    processing_time_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    video = relationship("Video", back_populates="transcription")
    segments = relationship(
        "TranscriptionSegment",
        back_populates="transcription",
        cascade="all, delete-orphan",
    )


class TranscriptionSegment(Base):
    __tablename__ = "transcription_segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    transcription_id = Column(
        Integer, ForeignKey("transcriptions.id"), nullable=False
    )
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    text = Column(Text, nullable=False)

    __table_args__ = (
        Index("ix_segments_transcription_id", "transcription_id"),
    )

    # Relationships
    transcription = relationship("Transcription", back_populates="segments")
