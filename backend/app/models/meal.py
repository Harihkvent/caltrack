from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class FoodItem(BaseModel):
    name: str
    qty: str | int | None = None
    calories: int
    protein_g: Decimal = Decimal("0")
    carbs_g: Decimal = Decimal("0")
    fat_g: Decimal = Decimal("0")
    sugar_g: Decimal = Decimal("0")
    fiber_g: Decimal = Decimal("0")
    sodium_mg: Decimal = Decimal("0")


class MealEstimate(BaseModel):
    food_items: list[FoodItem]
    calories: int
    protein_g: Decimal = Decimal("0")
    carbs_g: Decimal = Decimal("0")
    fat_g: Decimal = Decimal("0")
    sugar_g: Decimal = Decimal("0")
    fiber_g: Decimal = Decimal("0")
    sodium_mg: Decimal = Decimal("0")
    confidence: Decimal | None = Field(default=None, ge=0, le=1)


class CreateMealRequest(BaseModel):
    source: Literal["text", "photo"]
    raw_input: str | None = None
    photo_url: str | None = None
    idempotency_key: UUID

    @model_validator(mode="after")
    def validate_input(self) -> "CreateMealRequest":
        if self.source == "text" and not self.raw_input:
            raise ValueError("raw_input is required for text source")
        if self.source == "photo" and not self.photo_url:
            raise ValueError("photo_url is required for photo source")
        return self


class MealResponse(BaseModel):
    id: UUID
    calories: int
    protein_g: Decimal
    carbs_g: Decimal
    fat_g: Decimal
    sugar_g: Decimal
    fiber_g: Decimal
    sodium_mg: Decimal
    food_items: list[FoodItem]
    logged_at: datetime


class MealRow(MealResponse):
    user_id: UUID
    idempotency_key: UUID
    source: str
    raw_input: str | None = None
    photo_url: str | None = None
    confidence: Decimal | None = None


class MealsByDayResponse(BaseModel):
    meals: list[MealResponse]


class SummaryByDay(BaseModel):
    day: str
    calories: int


class SummaryResponse(BaseModel):
    total_calories: int
    avg_calories: float
    by_day: list[SummaryByDay]


class PatchMealRequest(BaseModel):
    calories: int | None = None
    protein_g: Decimal | None = None
    carbs_g: Decimal | None = None
    fat_g: Decimal | None = None
    sugar_g: Decimal | None = None
    fiber_g: Decimal | None = None
    sodium_mg: Decimal | None = None
