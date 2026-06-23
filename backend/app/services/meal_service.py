from datetime import date
from typing import Literal
from uuid import UUID

import asyncpg

from app.models.meal import CreateMealRequest, MealResponse, SummaryResponse
from app.repos.meals_repo import MealsRepo
from app.services.estimator import EstimatorService


class MealService:
    def __init__(self, pool: asyncpg.Pool, estimator: EstimatorService):
        self.repo = MealsRepo(pool)
        self.estimator = estimator

    async def create_meal(self, user_id: UUID, request: CreateMealRequest) -> MealResponse:
        estimate, raw = await self.estimator.estimate(request.source, request.raw_input, request.photo_url)
        return await self.repo.insert_meal(
            user_id=user_id,
            source=request.source,
            raw_input=request.raw_input,
            photo_url=request.photo_url,
            idempotency_key=request.idempotency_key,
            estimate=estimate,
            ai_raw_response=raw,
        )

    async def list_meals_for_day(self, user_id: UUID, day: date):
        return await self.repo.get_meals_for_day(user_id, day)

    async def summary(self, user_id: UUID, range_name: Literal["week", "month"]) -> SummaryResponse:
        return await self.repo.get_summary(user_id, range_name)
