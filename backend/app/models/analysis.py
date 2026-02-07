from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    analysis_type = Column(String(100), nullable=False)
    scope = Column(String(50), nullable=False)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=True)
    result_json = Column(Text, nullable=False)
    gemini_model_used = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    video = relationship("Video", back_populates="analyses")
