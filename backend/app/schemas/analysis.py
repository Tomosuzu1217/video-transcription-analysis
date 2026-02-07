from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class AnalysisRequest(BaseModel):
    analysis_type: str  # "keywords", "correlation", "ai-recommendations"


class KeywordItem(BaseModel):
    keyword: str
    count: int
    video_counts: dict[int, int]  # maps video_id to count


class CorrelationItem(BaseModel):
    keyword: str
    avg_conversion_with: float
    avg_conversion_without: float
    effectiveness_score: float
    video_count: int


class AiRecommendation(BaseModel):
    category: str
    recommendation: str
    priority: str


class AiAnalysisResult(BaseModel):
    summary: str
    effective_keywords: list[dict]
    effective_phrases: list[dict]
    correlation_insights: list[dict]
    recommendations: list[AiRecommendation]
    funnel_suggestions: list[dict]


class PsychologicalContentResult(BaseModel):
    overall_summary: str = ""
    emotion_volatility_analysis: dict = {}
    storytelling_analysis: dict = {}
    conversion_pipeline_analysis: dict = {}
    metrics_correlation: dict = {}
    cross_video_insights: list[dict] = []
    recommendations: list[dict] = []
    nlp_preanalysis: list[dict] = []


class AnalysisResponse(BaseModel):
    id: int
    analysis_type: str
    scope: str
    video_id: Optional[int] = None
    result_json: str
    gemini_model_used: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardResponse(BaseModel):
    total_videos: int
    transcribed_videos: int
    top_keywords: list[KeywordItem]
    video_summaries: list[dict]
    latest_ai_recommendations: Optional[AiAnalysisResult] = None
