from datetime import date, datetime, timedelta, timezone
from uuid import UUID

import asyncpg

from app.models.exercise import ExerciseEstimate, ExerciseResponse


class ExercisesRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def insert_exercise(
        self,
        user_id: UUID,
        estimate: ExerciseEstimate,
    ) -> ExerciseResponse:
        query = """
            insert into exercises (user_id, name, calories_burned)
            values ($1, $2, $3)
            returning id, user_id, name, calories_burned, logged_at
        """
        row = await self.pool.fetchrow(
            query,
            user_id,
            estimate.name,
            estimate.calories_burned,
        )
        return ExerciseResponse(**dict(row))

    async def get_exercises_for_day(self, user_id: UUID, day: date) -> list[ExerciseResponse]:
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        query = """
            select id, user_id, name, calories_burned, logged_at
            from exercises
            where user_id = $1 and logged_at >= $2 and logged_at < $3
            order by logged_at desc
        """
        rows = await self.pool.fetch(query, user_id, start, end)
        return [ExerciseResponse(**dict(r)) for r in rows]

    async def delete_exercise(self, user_id: UUID, exercise_id: UUID) -> bool:
        """Delete an exercise by id, scoped to user_id. Returns True if deleted."""
        query = "delete from exercises where id = $1 and user_id = $2"
        result = await self.pool.execute(query, exercise_id, user_id)
        return result.endswith("1")

    async def update_exercise(
        self,
        user_id: UUID,
        exercise_id: UUID,
        patch: dict,
    ) -> ExerciseResponse | None:
        """Partially update an exercise. Only non-None fields are updated."""
        allowed = ["name", "calories_burned"]
        sets = []
        values: list = []
        for col in allowed:
            if col in patch and patch[col] is not None:
                values.append(patch[col])
                sets.append(f"{col} = ${len(values)}")
        if not sets:
            return None
        values.extend([exercise_id, user_id])
        query = f"""
            update exercises
            set {', '.join(sets)}
            where id = ${len(values) - 1} and user_id = ${len(values)}
            returning id, user_id, name, calories_burned, logged_at
        """
        row = await self.pool.fetchrow(query, *values)
        if row is None:
            return None
        return ExerciseResponse(**dict(row))
