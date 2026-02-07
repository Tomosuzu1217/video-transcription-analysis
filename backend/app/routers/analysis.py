import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import Video, Analysis
from app.services import analysis_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analysis"])


def _safe_json_loads(raw: str) -> dict:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


@router.post("/analysis/keywords")
def run_keyword_analysis(db: Session = Depends(get_db)):
    try:
        return analysis_service.run_keyword_analysis(db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Keyword analysis failed")
        raise HTTPException(status_code=500, detail=f"キーワード分析に失敗しました: {e}")


@router.post("/analysis/keywords/{video_id}")
def run_video_keyword_analysis(video_id: int, db: Session = Depends(get_db)):
    try:
        return analysis_service.run_video_keyword_analysis(db, video_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Video keyword analysis failed")
        raise HTTPException(status_code=500, detail=f"キーワード分析に失敗しました: {e}")


@router.post("/analysis/correlation")
def run_correlation_analysis(db: Session = Depends(get_db)):
    try:
        return analysis_service.run_correlation_analysis(db)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Correlation analysis failed")
        raise HTTPException(status_code=500, detail=f"相関分析に失敗しました: {e}")


class AiAnalysisRequest(BaseModel):
    custom_prompt: Optional[str] = None


@router.post("/analysis/ai-recommendations")
def run_ai_recommendations(
    request: AiAnalysisRequest = None,
    db: Session = Depends(get_db),
):
    try:
        custom_prompt = request.custom_prompt if request else None
        return analysis_service.run_ai_analysis(db, custom_prompt=custom_prompt)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("AI analysis failed")
        raise HTTPException(status_code=500, detail=f"AI分析に失敗しました: {e}")


@router.get("/analysis/results")
def get_analysis_results(
    analysis_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(Analysis)
    if analysis_type:
        query = query.filter(Analysis.analysis_type == analysis_type)
    analyses = query.order_by(Analysis.created_at.desc()).limit(limit).all()

    results = []
    for a in analyses:
        results.append({
            "id": a.id,
            "analysis_type": a.analysis_type,
            "scope": a.scope,
            "video_id": a.video_id,
            "result": _safe_json_loads(a.result_json),
            "gemini_model_used": a.gemini_model_used,
            "created_at": a.created_at.isoformat(),
        })
    return results


@router.post("/analysis/ranking-comparison")
def run_ranking_comparison_analysis(
    request: AiAnalysisRequest = None,
    db: Session = Depends(get_db),
):
    """Compare top-ranked videos with others using psychological and storytelling analysis."""
    try:
        custom_prompt = request.custom_prompt if request else None
        return analysis_service.run_ranking_comparison_analysis(db, custom_prompt=custom_prompt)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Ranking comparison analysis failed")
        raise HTTPException(status_code=500, detail=f"ランキング比較分析に失敗しました: {e}")


@router.post("/analysis/psychological-content")
def run_psychological_content(
    request: AiAnalysisRequest = None,
    db: Session = Depends(get_db),
):
    """Analyze video content using psychological framework: emotion volatility, storytelling, conversion pipeline."""
    try:
        custom_prompt = request.custom_prompt if request else None
        return analysis_service.run_psychological_content_analysis(db, custom_prompt=custom_prompt)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Psychological content analysis failed")
        raise HTTPException(status_code=500, detail=f"心理コンテンツ分析に失敗しました: {e}")


@router.get("/analysis/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    total_videos = db.query(Video).count()
    transcribed_videos = db.query(Video).filter(Video.status == "transcribed").count()
    processing_videos = db.query(Video).filter(
        Video.status.in_(["uploaded", "transcribing"])
    ).count()
    error_videos = db.query(Video).filter(Video.status == "error").count()

    # Get latest keyword analysis
    latest_keywords = (
        db.query(Analysis)
        .filter(Analysis.analysis_type == "keyword_frequency")
        .order_by(Analysis.created_at.desc())
        .first()
    )
    top_keywords = []
    if latest_keywords:
        kw_data = _safe_json_loads(latest_keywords.result_json)
        top_keywords = kw_data.get("keywords", [])[:20]

    # Get video summaries with duration stats (eager-load conversions to avoid N+1)
    videos = (
        db.query(Video)
        .options(joinedload(Video.conversions))
        .order_by(Video.created_at.desc())
        .all()
    )
    video_summaries = []
    durations = []
    total_conversions = 0
    for v in videos:
        if v.duration_seconds:
            durations.append(v.duration_seconds)
        conv_map = {c.metric_name: c.metric_value for c in v.conversions} if v.conversions else {}
        total_conversions += len(v.conversions) if v.conversions else 0
        summary = {
            "id": v.id,
            "filename": v.filename,
            "status": v.status,
            "duration_seconds": v.duration_seconds,
            "conversions": conv_map,
        }
        video_summaries.append(summary)

    avg_duration = sum(durations) / len(durations) if durations else None
    total_duration = sum(durations) if durations else None

    # Get latest AI recommendations
    latest_ai = (
        db.query(Analysis)
        .filter(Analysis.analysis_type == "ai_recommendation")
        .order_by(Analysis.created_at.desc())
        .first()
    )
    ai_recommendations = None
    if latest_ai:
        ai_recommendations = _safe_json_loads(latest_ai.result_json)

    return {
        "total_videos": total_videos,
        "transcribed_videos": transcribed_videos,
        "processing_videos": processing_videos,
        "error_videos": error_videos,
        "avg_duration_seconds": round(avg_duration, 1) if avg_duration else None,
        "total_duration_seconds": round(total_duration, 1) if total_duration else None,
        "total_conversions": total_conversions,
        "top_keywords": top_keywords,
        "video_summaries": video_summaries,
        "latest_ai_recommendations": ai_recommendations,
    }
