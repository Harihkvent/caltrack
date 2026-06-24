from uuid import UUID
import asyncpg
from app.models.weight import WeightLogResponse


class WeightRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def insert_weight(self, user_id: UUID, weight_kg: float) -> WeightLogResponse:
        query = """
            insert into weight_logs (user_id, weight_kg)
            values ($1, $2)
            returning id, weight_kg, logged_at
        """
        row = await self.pool.fetchrow(query, user_id, weight_kg)
        return WeightLogResponse(**dict(row))

    async def get_weight_history(self, user_id: UUID) -> list[WeightLogResponse]:
        query = """
            select id, weight_kg, logged_at
            from weight_logs
            where user_id = $1
            order by logged_at desc
            limit 100
        """
        rows = await self.pool.fetch(query, user_id)
        return [WeightLogResponse(**dict(row)) for row in rows]
