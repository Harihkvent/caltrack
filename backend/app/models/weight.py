from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field


class LogWeightRequest(BaseModel):
    weight_kg: Decimal = Field(..., ge=10, le=500)


class WeightLogResponse(BaseModel):
    id: UUID
    weight_kg: Decimal
    logged_at: datetime
