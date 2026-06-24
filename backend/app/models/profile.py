from uuid import UUID

from pydantic import BaseModel, Field


class GoalsPatchRequest(BaseModel):
    daily_calorie_goal: int | None = Field(default=None, ge=800, le=10000)
    daily_protein_goal_g: int | None = Field(default=None, ge=0, le=1000)


class ProfileResponse(BaseModel):
    id: UUID
    display_name: str
    daily_calorie_goal: int
    daily_protein_goal_g: int
