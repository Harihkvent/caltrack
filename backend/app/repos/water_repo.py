from datetime import datetime, date, timedelta, timezone
from uuid import UUID
import asyncpg
from app.models.water import WaterLogResponse, WaterDailySummary


class WaterRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def insert_water(self, user_id: UUID, amount_ml: int) -> WaterLogResponse:
        query = """
            insert into water_logs (user_id, amount_ml)
            values ($1, $2)
            returning id, amount_ml, logged_at
        """
        row = await self.pool.fetchrow(query, user_id, amount_ml)
        return WaterLogResponse(**dict(row))

    async def get_today_water(self, user_id: UUID, day: date) -> WaterDailySummary:
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = """
            select id, amount_ml, logged_at
            from water_logs
            where user_id = $1 and logged_at >= $2 and logged_at < $3
            order by logged_at desc
        """
        rows = await self.pool.fetch(query, user_id, start, end)
        logs = [WaterLogResponse(**dict(row)) for row in rows]
        total = sum(log.amount_ml for log in logs)
        return WaterDailySummary(total_ml=total, logs=logs)
