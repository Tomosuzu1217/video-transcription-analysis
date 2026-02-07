import json
import logging
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from app.config import settings
from app.models import Video, Analysis
from app.services import nlp_service, gemini_service

logger = logging.getLogger(__name__)


def run_keyword_analysis(db: Session) -> dict:
    """Run keyword frequency analysis across all transcribed videos."""
    videos = db.query(Video).options(joinedload(Video.transcription)).filter(Video.status == "transcribed").all()
    if not videos:
        return {"keywords": [], "video_count": 0}

    all_keywords: dict = {}

    for video in videos:
        if not video.transcription:
            continue
        keywords = nlp_service.extract_keywords(video.transcription.full_text)
        for kw_data in keywords:
            kw = kw_data["keyword"]
            if kw not in all_keywords:
                all_keywords[kw] = {"total_count": 0, "video_counts": {}}
            all_keywords[kw]["total_count"] += kw_data["count"]
            all_keywords[kw]["video_counts"][str(video.id)] = kw_data["count"]

    sorted_keywords = sorted(all_keywords.items(), key=lambda x: x[1]["total_count"], reverse=True)
    result = {
        "keywords": [
            {"keyword": kw, "count": data["total_count"], "video_counts": data["video_counts"]}
            for kw, data in sorted_keywords[:50]
        ],
        "video_count": len(videos),
    }

    analysis = Analysis(
        analysis_type="keyword_frequency",
        scope="cross_video",
        result_json=json.dumps(result, ensure_ascii=False),
    )
    db.add(analysis)
    db.commit()
    return result


def run_video_keyword_analysis(db: Session, video_id: int) -> dict:
    """Run keyword and phrase analysis for a single video."""
    video = db.query(Video).options(joinedload(Video.transcription)).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    if not video.transcription:
        raise HTTPException(status_code=400, detail="書き起こしが完了していません")

    text = video.transcription.full_text
    keywords = nlp_service.extract_keywords(text, top_n=30)
    phrases = nlp_service.extract_phrases(text, n=2, top_n=20)

    result = {
        "video_id": video_id,
        "video_filename": video.filename,
        "keywords": keywords,
        "phrases": phrases,
    }

    analysis = Analysis(
        analysis_type="keyword_frequency",
        scope="single_video",
        video_id=video_id,
        result_json=json.dumps(result, ensure_ascii=False),
    )
    db.add(analysis)
    db.commit()
    return result


def run_correlation_analysis(db: Session) -> dict:
    """Correlate keyword presence with conversion metrics."""
    videos = (
        db.query(Video)
        .options(joinedload(Video.transcription), joinedload(Video.conversions))
        .filter(Video.status == "transcribed")
        .all()
    )
    videos_with_data = [v for v in videos if v.transcription and v.conversions]

    if len(videos_with_data) < 2:
        return {"correlations": [], "message": "分析には書き起こしとコンバージョンデータがある動画が2本以上必要です"}

    # Build keyword-video matrix
    video_keywords: dict[int, set] = {}
    all_kw_set: set = set()
    for v in videos_with_data:
        kws = nlp_service.extract_keywords(v.transcription.full_text, top_n=30)
        kw_set = {k["keyword"] for k in kws}
        video_keywords[v.id] = kw_set
        all_kw_set.update(kw_set)

    # Get primary conversion metric per video (first metric or "登録数")
    video_conversions: dict[int, float] = {}
    for v in videos_with_data:
        primary = next((c for c in v.conversions if c.metric_name == "登録数"), None)
        if not primary and v.conversions:
            primary = v.conversions[0]
        if primary:
            video_conversions[v.id] = primary.metric_value

    correlations = []
    for kw in all_kw_set:
        with_kw = [vid for vid, kws in video_keywords.items() if kw in kws and vid in video_conversions]
        without_kw = [vid for vid, kws in video_keywords.items() if kw not in kws and vid in video_conversions]

        if not with_kw or not without_kw:
            continue

        avg_with = sum(video_conversions[vid] for vid in with_kw) / len(with_kw)
        avg_without = sum(video_conversions[vid] for vid in without_kw) / len(without_kw)
        effectiveness = avg_with / avg_without if avg_without > 0 else 0

        correlations.append({
            "keyword": kw,
            "avg_conversion_with": round(avg_with, 2),
            "avg_conversion_without": round(avg_without, 2),
            "effectiveness_score": round(effectiveness, 2),
            "video_count": len(with_kw),
        })

    correlations.sort(key=lambda x: x["effectiveness_score"], reverse=True)
    result = {"correlations": correlations[:30]}

    analysis = Analysis(
        analysis_type="correlation",
        scope="cross_video",
        result_json=json.dumps(result, ensure_ascii=False),
    )
    db.add(analysis)
    db.commit()
    return result


def run_ai_analysis(db: Session, custom_prompt: str = None) -> dict:
    """Run Gemini-powered analysis."""
    videos = (
        db.query(Video)
        .options(joinedload(Video.transcription), joinedload(Video.conversions))
        .filter(Video.status == "transcribed")
        .all()
    )
    videos_with_transcription = [v for v in videos if v.transcription]

    if not videos_with_transcription:
        raise HTTPException(status_code=400, detail="書き起こし済みの動画がありません。まず動画をアップロードして書き起こしを完了してください。")

    videos_data = []
    for video in videos_with_transcription:
        conversions = {c.metric_name: c.metric_value for c in video.conversions}
        videos_data.append({
            "name": video.filename,
            "transcript": video.transcription.full_text,
            "conversions": conversions,
        })

    try:
        result = gemini_service.analyze_cm_effectiveness(videos_data, custom_prompt=custom_prompt)
    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"Gemini AI analysis failed: {error_msg}")
        if "APIキーが設定されていません" in error_msg:
            raise HTTPException(status_code=503, detail="Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。")
        elif "レート制限" in error_msg:
            raise HTTPException(status_code=503, detail="全てのAPIキーがレート制限に達しました。しばらく待ってから再試行してください。")
        raise HTTPException(status_code=503, detail=error_msg)
    except Exception as e:
        logger.exception("Unexpected error during AI analysis")
        raise HTTPException(status_code=500, detail=f"AI分析中にエラーが発生しました: {str(e)[:200]}")

    # Read current model from DB settings
    from app.routers.settings import get_selected_model
    model_used = get_selected_model(db)

    analysis = Analysis(
        analysis_type="ai_recommendation",
        scope="cross_video",
        result_json=json.dumps(result, ensure_ascii=False),
        gemini_model_used=model_used,
    )
    db.add(analysis)
    db.commit()
    return result


def run_ranking_comparison_analysis(db: Session, custom_prompt: str = None) -> dict:
    """Compare top-ranked videos with lower-ranked/unranked videos using psychological and storytelling analysis."""
    videos = (
        db.query(Video)
        .options(joinedload(Video.transcription), joinedload(Video.conversions))
        .filter(Video.status == "transcribed")
        .all()
    )
    videos_with_transcription = [v for v in videos if v.transcription]

    if not videos_with_transcription:
        raise HTTPException(status_code=400, detail="書き起こし済みの動画がありません。")

    # Separate ranked and unranked videos
    ranked_videos = [v for v in videos_with_transcription if v.ranking is not None]

    if not ranked_videos:
        raise HTTPException(status_code=400, detail="ランキングが設定された動画がありません。まず動画にランキングを設定してください。")

    # Sort by ranking (1 = best)
    ranked_videos.sort(key=lambda v: v.ranking)

    # Get top videos (ranking 1-3) and others
    top_videos = [v for v in ranked_videos if v.ranking <= 3]
    other_videos = [v for v in ranked_videos if v.ranking > 3]
    unranked_videos = [v for v in videos_with_transcription if v.ranking is None]

    if not top_videos:
        raise HTTPException(status_code=400, detail="ランキング上位（1-3位）の動画がありません。")

    # Build data for analysis
    top_videos_data = []
    for video in top_videos:
        conversions = {c.metric_name: c.metric_value for c in video.conversions}
        top_videos_data.append({
            "name": video.filename,
            "ranking": video.ranking,
            "ranking_notes": video.ranking_notes,
            "transcript": video.transcription.full_text,
            "conversions": conversions,
        })

    other_videos_data = []
    for video in (other_videos + unranked_videos)[:5]:  # Limit to 5 comparison videos
        conversions = {c.metric_name: c.metric_value for c in video.conversions}
        other_videos_data.append({
            "name": video.filename,
            "ranking": video.ranking,
            "transcript": video.transcription.full_text,
            "conversions": conversions,
        })

    try:
        result = gemini_service.analyze_ranking_comparison(
            top_videos_data,
            other_videos_data,
            custom_prompt=custom_prompt
        )
    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"Gemini ranking comparison analysis failed: {error_msg}")
        if "APIキーが設定されていません" in error_msg:
            raise HTTPException(status_code=503, detail="Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。")
        elif "レート制限" in error_msg:
            raise HTTPException(status_code=503, detail="全てのAPIキーがレート制限に達しました。しばらく待ってから再試行してください。")
        raise HTTPException(status_code=503, detail=error_msg)
    except Exception as e:
        logger.exception("Unexpected error during ranking comparison analysis")
        raise HTTPException(status_code=500, detail=f"ランキング比較分析中にエラーが発生しました: {str(e)[:200]}")

    # Read current model from DB settings
    from app.routers.settings import get_selected_model
    model_used = get_selected_model(db)

    analysis = Analysis(
        analysis_type="ranking_comparison",
        scope="cross_video",
        result_json=json.dumps(result, ensure_ascii=False),
        gemini_model_used=model_used,
    )
    db.add(analysis)
    db.commit()
    return result


def run_psychological_content_analysis(db: Session, custom_prompt: str = None) -> dict:
    """Run psychological content analysis using emotion volatility, storytelling, and conversion pipeline framework."""
    from sqlalchemy.orm import joinedload as jl

    videos = (
        db.query(Video)
        .options(
            jl(Video.transcription),
            jl(Video.conversions),
        )
        .filter(Video.status == "transcribed")
        .all()
    )
    videos_with_transcription = [v for v in videos if v.transcription]

    if not videos_with_transcription:
        raise HTTPException(
            status_code=400,
            detail="書き起こし済みの動画がありません。まず動画をアップロードして書き起こしを完了してください。",
        )

    # Load segments for each transcription (eager load)
    for v in videos_with_transcription:
        # Force-load segments if not already loaded
        _ = v.transcription.segments

    videos_data = []
    for video in videos_with_transcription:
        # Build segment dicts for NLP analysis
        segments = [
            {
                "start_time": seg.start_time,
                "end_time": seg.end_time,
                "text": seg.text,
            }
            for seg in sorted(video.transcription.segments, key=lambda s: s.start_time)
        ]

        # Run NLP emotion analysis on segments
        emotion_segments = nlp_service.analyze_segment_emotions(segments)

        # Calculate volatility metrics
        volatility = nlp_service.calculate_emotion_volatility(emotion_segments)

        # Detect persuasion techniques in full text
        persuasion_techniques = nlp_service.detect_persuasion_techniques(
            video.transcription.full_text
        )

        # Build conversion data
        conversions = {c.metric_name: c.metric_value for c in video.conversions}

        videos_data.append({
            "name": video.filename,
            "transcript": video.transcription.full_text,
            "emotion_segments": emotion_segments,
            "volatility": volatility,
            "persuasion_techniques": persuasion_techniques,
            "conversions": conversions,
        })

    try:
        result = gemini_service.analyze_psychological_content(
            videos_data, custom_prompt=custom_prompt
        )
    except RuntimeError as e:
        error_msg = str(e)
        logger.error(f"Gemini psychological content analysis failed: {error_msg}")
        if "APIキーが設定されていません" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="Gemini APIキーが設定されていません。設定画面からAPIキーを追加してください。",
            )
        elif "レート制限" in error_msg:
            raise HTTPException(
                status_code=503,
                detail="全てのAPIキーがレート制限に達しました。しばらく待ってから再試行してください。",
            )
        raise HTTPException(status_code=503, detail=error_msg)
    except Exception as e:
        logger.exception("Unexpected error during psychological content analysis")
        raise HTTPException(
            status_code=500,
            detail=f"心理分析中にエラーが発生しました: {str(e)[:200]}",
        )

    # Attach NLP pre-analysis data to result for frontend display
    nlp_preanalysis = []
    for vd in videos_data:
        nlp_preanalysis.append({
            "video_name": vd["name"],
            "volatility": vd["volatility"],
            "persuasion_techniques": vd["persuasion_techniques"],
            "emotion_segments": [
                {
                    "start_time": s["start_time"],
                    "end_time": s["end_time"],
                    "emotion_score": s["emotion_score"],
                }
                for s in vd["emotion_segments"]
            ],
        })
    result["nlp_preanalysis"] = nlp_preanalysis

    # Read current model from DB settings
    from app.routers.settings import get_selected_model
    model_used = get_selected_model(db)

    analysis = Analysis(
        analysis_type="psychological_content",
        scope="cross_video",
        result_json=json.dumps(result, ensure_ascii=False),
        gemini_model_used=model_used,
    )
    db.add(analysis)
    db.commit()
    return result
