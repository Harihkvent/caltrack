from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class LogWaterRequest(BaseModel):
    amount_ml: int = Field(..., ge=1, le=5000)


class WaterLogResponse(BaseModel):
    id: UUID
    amount_ml: int
    logged_at: datetime


class WaterDailySummary(BaseModel):
    total_ml: int
    logs: list[WaterLogResponse]
