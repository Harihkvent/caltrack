from uuid import UUID

import asyncpg

from app.models.profile import ProfileResponse


class ProfilesRepo:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def ensure_profile(self, user_id: UUID) -> None:
        await self.pool.execute(
            """
            insert into profiles(id, display_name, daily_calorie_goal, daily_protein_goal_g)
            values ($1, 'User', 2000, 100)
            on conflict (id) do nothing
            """,
            user_id,
        )

    async def get_profile(self, user_id: UUID) -> ProfileResponse:
        await self.ensure_profile(user_id)
        row = await self.pool.fetchrow(
            """
            select id, display_name, daily_calorie_goal, daily_protein_goal_g
            from profiles where id = $1
            """,
            user_id,
        )
        return ProfileResponse(**dict(row))

    async def update_goals(
        self, user_id: UUID, daily_calorie_goal: int | None, daily_protein_goal_g: int | None
    ) -> ProfileResponse:
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    insert into profiles(id, display_name, daily_calorie_goal, daily_protein_goal_g)
                    values ($1, 'User', 2000, 100)
                    on conflict (id) do nothing
                    """,
                    user_id,
                )
                row = await conn.fetchrow(
                    """
                    update profiles
                    set
                        daily_calorie_goal = coalesce($2, daily_calorie_goal),
                        daily_protein_goal_g = coalesce($3, daily_protein_goal_g)
                    where id = $1
                    returning id, display_name, daily_calorie_goal, daily_protein_goal_g
                    """,
                    user_id,
                    daily_calorie_goal,
                    daily_protein_goal_g,
                )
        return ProfileResponse(**dict(row))
