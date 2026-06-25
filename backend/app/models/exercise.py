from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from app.models.meal import MealResponse


class ExerciseEstimate(BaseModel):
    name: str
    calories_burned: int
    confidence: Decimal | None = None


class ExerciseResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    calories_burned: int
    logged_at: datetime


class LogEntryResponse(BaseModel):
    type: Literal["meal", "exercise"]
    meal: MealResponse | None = None
    exercise: ExerciseResponse | None = None


class PatchExerciseRequest(BaseModel):
    name: str | None = None
    calories_burned: int | None = None
