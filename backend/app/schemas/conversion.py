import math
from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional


class ConversionBase(BaseModel):
    video_id: int
    metric_name: str
    metric_value: float
    date_recorded: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("metric_value")
    @classmethod
    def validate_metric_value(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v):
            raise ValueError("NaN や無限大は入力できません")
        if v < 0:
            raise ValueError("値は0以上で入力してください")
        if v > 1_000_000_000:
            raise ValueError("値が大きすぎます（上限: 10億）")
        return v

    @field_validator("metric_name")
    @classmethod
    def validate_metric_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("指標名を入力してください")
        if len(v) > 100:
            raise ValueError("指標名は100文字以内で入力してください")
        return v


class ConversionCreate(ConversionBase):
    pass


class ConversionUpdate(BaseModel):
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    date_recorded: Optional[date] = None
    notes: Optional[str] = None

    @field_validator("metric_value")
    @classmethod
    def validate_metric_value(cls, v: float | None) -> float | None:
        if v is None:
            return v
        if math.isnan(v) or math.isinf(v):
            raise ValueError("NaN や無限大は入力できません")
        if v < 0:
            raise ValueError("値は0以上で入力してください")
        if v > 1_000_000_000:
            raise ValueError("値が大きすぎます")
        return v


class ConversionResponse(ConversionBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversionSummary(BaseModel):
    video_id: int
    video_filename: str
    metrics: dict[str, float]
