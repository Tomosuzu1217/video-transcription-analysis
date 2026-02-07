from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(500), nullable=False)
    filepath = Column(String(1000), nullable=False)
    file_size = Column(Integer, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    status = Column(String(50), nullable=False, default="uploaded")
    error_message = Column(Text, nullable=True)
    ranking = Column(Integer, nullable=True)  # ユーザー設定のランキング（1が最高）
    ranking_notes = Column(Text, nullable=True)  # ランキングの理由メモ
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    transcription = relationship(
        "Transcription",
        back_populates="video",
        uselist=False,
        cascade="all, delete-orphan",
    )
    conversions = relationship(
        "Conversion",
        back_populates="video",
        cascade="all, delete-orphan",
    )
    analyses = relationship(
        "Analysis",
        back_populates="video",
        cascade="all, delete-orphan",
    )
