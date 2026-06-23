from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user_id
from app.db import get_pool
from app.models.meal import CreateMealRequest, MealResponse, SummaryResponse
from app.models.profile import GoalsPatchRequest, ProfileResponse
from app.repos.profiles_repo import ProfilesRepo
from app.services.estimator import EstimatorService
from app.services.estimator import EstimationFailed
from app.services.meal_service import MealService

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/meals", response_model=MealResponse)
async def create_meal(payload: CreateMealRequest, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    service = MealService(pool, EstimatorService())
    try:
        return await service.create_meal(user_id, payload)
    except EstimationFailed as exc:
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail=f"Meal estimation failed: {exc}",
        ) from exc


@router.get("/meals", response_model=list[MealResponse])
async def list_meals(
    date_value: date = Query(alias="date"), user_id: UUID = Depends(current_user_id)
):
    pool = await get_pool()
    service = MealService(pool, EstimatorService())
    return await service.list_meals_for_day(user_id, date_value)


@router.get("/summary", response_model=SummaryResponse)
async def summary(
    range_name: Literal["week", "month"] = Query(alias="range"),
    user_id: UUID = Depends(current_user_id),
):
    pool = await get_pool()
    service = MealService(pool, EstimatorService())
    return await service.summary(user_id, range_name)


@router.patch("/goals", response_model=ProfileResponse)
async def patch_goals(payload: GoalsPatchRequest, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = ProfilesRepo(pool)
    return await repo.update_goals(user_id, payload.daily_calorie_goal, payload.daily_protein_goal_g)


@router.get("/goals", response_model=ProfileResponse)
async def get_goals(user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = ProfilesRepo(pool)
    return await repo.get_profile(user_id)
