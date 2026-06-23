import json
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

import asyncpg

from app.models.meal import MealEstimate, MealResponse, SummaryByDay, SummaryResponse


class MealsRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def insert_meal(
        self,
        user_id: UUID,
        source: Literal["text", "photo"],
        raw_input: str | None,
        photo_url: str | None,
        idempotency_key: UUID,
        estimate: MealEstimate,
        ai_raw_response: dict,
    ) -> MealResponse:
        query = """
            insert into meals (
                user_id, idempotency_key, source, raw_input, photo_url,
                food_items, calories, protein_g, carbs_g, fat_g, confidence, ai_raw_response
            )
            values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb)
            on conflict (user_id, idempotency_key) do update
            set idempotency_key = excluded.idempotency_key
            returning id, calories, protein_g, carbs_g, fat_g, food_items, logged_at
        """
        row = await self.pool.fetchrow(
            query,
            user_id,
            idempotency_key,
            source,
            raw_input,
            photo_url,
            json.dumps([item.model_dump(mode="json") for item in estimate.food_items]),
            estimate.calories,
            estimate.protein_g,
            estimate.carbs_g,
            estimate.fat_g,
            estimate.confidence,
            json.dumps(ai_raw_response),
        )
        return MealResponse(**dict(row))

    async def get_meals_for_day(self, user_id: UUID, day: date) -> list[MealResponse]:
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = """
            select id, calories, protein_g, carbs_g, fat_g, food_items, logged_at
            from meals
            where user_id = $1 and logged_at >= $2 and logged_at < $3
            order by logged_at desc
        """
        rows = await self.pool.fetch(query, user_id, start, end)
        return [MealResponse(**dict(row)) for row in rows]

    async def get_summary(self, user_id: UUID, range_name: Literal["week", "month"]) -> SummaryResponse:
        days = 7 if range_name == "week" else 30
        start = datetime.now(tz=timezone.utc) - timedelta(days=days - 1)
        query = """
            select date(logged_at) as day, coalesce(sum(calories), 0)::int as calories
            from meals
            where user_id = $1 and logged_at >= $2
            group by day
            order by day
        """
        rows = await self.pool.fetch(query, user_id, start)
        by_day = [SummaryByDay(day=str(r["day"]), calories=r["calories"]) for r in rows]
        total = sum(r["calories"] for r in rows)
        avg = float(total / max(1, days))
        return SummaryResponse(total_calories=total, avg_calories=avg, by_day=by_day)
