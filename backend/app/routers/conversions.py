from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from app.database import get_db
from app.models import Video, Conversion
from app.schemas.conversion import ConversionCreate, ConversionUpdate, ConversionResponse, ConversionSummary

router = APIRouter(tags=["conversions"])


@router.post("/conversions", response_model=ConversionResponse)
def create_conversion(data: ConversionCreate, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == data.video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="動画が見つかりません")

    conversion = Conversion(
        video_id=data.video_id,
        metric_name=data.metric_name,
        metric_value=data.metric_value,
        date_recorded=data.date_recorded,
        notes=data.notes,
    )
    db.add(conversion)
    db.commit()
    db.refresh(conversion)
    return conversion


@router.get("/conversions", response_model=list[ConversionResponse])
def list_conversions(video_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    query = db.query(Conversion)
    if video_id is not None:
        query = query.filter(Conversion.video_id == video_id)
    return query.order_by(Conversion.created_at.desc()).all()


@router.put("/conversions/{conversion_id}", response_model=ConversionResponse)
def update_conversion(conversion_id: int, data: ConversionUpdate, db: Session = Depends(get_db)):
    conversion = db.query(Conversion).filter(Conversion.id == conversion_id).first()
    if not conversion:
        raise HTTPException(status_code=404, detail="コンバージョンデータが見つかりません")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(conversion, key, value)

    db.commit()
    db.refresh(conversion)
    return conversion


@router.delete("/conversions/{conversion_id}")
def delete_conversion(conversion_id: int, db: Session = Depends(get_db)):
    conversion = db.query(Conversion).filter(Conversion.id == conversion_id).first()
    if not conversion:
        raise HTTPException(status_code=404, detail="コンバージョンデータが見つかりません")

    db.delete(conversion)
    db.commit()
    return {"message": "コンバージョンデータを削除しました"}


@router.get("/conversions/summary", response_model=list[ConversionSummary])
def get_conversion_summary(db: Session = Depends(get_db)):
    videos = db.query(Video).options(joinedload(Video.conversions)).all()
    summaries = []
    for video in videos:
        if video.conversions:
            metrics = {c.metric_name: c.metric_value for c in video.conversions}
            summaries.append(ConversionSummary(
                video_id=video.id,
                video_filename=video.filename,
                metrics=metrics,
            ))
    return summaries
