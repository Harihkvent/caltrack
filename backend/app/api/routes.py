from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user_id
from app.db import get_pool
from app.models.meal import CreateMealRequest, MealResponse, SummaryResponse
from app.models.profile import GoalsPatchRequest, ProfileResponse
from app.models.weight import LogWeightRequest, WeightLogResponse
from app.models.water import LogWaterRequest, WaterLogResponse, WaterDailySummary
from app.models.exercise import ExerciseResponse, LogEntryResponse
from app.repos.profiles_repo import ProfilesRepo
from app.repos.weight_repo import WeightRepo
from app.repos.water_repo import WaterRepo
from app.repos.meals_repo import MealsRepo
from app.repos.exercises_repo import ExercisesRepo
from app.services.estimator import EstimatorService, EstimationFailed
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
        print(f"Meal estimation failed: {exc}")
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


@router.post("/weight", response_model=WeightLogResponse)
async def log_weight(payload: LogWeightRequest, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = WeightRepo(pool)
    return await repo.insert_weight(user_id, float(payload.weight_kg))


@router.get("/weight", response_model=list[WeightLogResponse])
async def get_weight_history(user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = WeightRepo(pool)
    return await repo.get_weight_history(user_id)


@router.post("/water", response_model=WaterLogResponse)
async def log_water(payload: LogWaterRequest, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = WaterRepo(pool)
    return await repo.insert_water(user_id, payload.amount_ml)


@router.get("/water", response_model=WaterDailySummary)
async def get_water_logs(
    date_value: date = Query(alias="date"), user_id: UUID = Depends(current_user_id)
):
    pool = await get_pool()
    repo = WaterRepo(pool)
    return await repo.get_today_water(user_id, date_value)


@router.post("/entries", response_model=LogEntryResponse)
async def create_entry(payload: CreateMealRequest, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    estimator = EstimatorService()
    profiles_repo = ProfilesRepo(pool)
    meals_repo = MealsRepo(pool)
    exercises_repo = ExercisesRepo(pool)

    await profiles_repo.ensure_profile(user_id)

    try:
        classification, raw = await estimator.estimate(payload.source, payload.raw_input, payload.photo_url)
    except EstimationFailed as exc:
        print(f"Estimation failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_424_FAILED_DEPENDENCY,
            detail=f"Estimation failed: {exc}",
        ) from exc

    if classification.type == "exercise" and classification.exercise_data:
        exercise_response = await exercises_repo.insert_exercise(user_id, classification.exercise_data)
        return LogEntryResponse(type="exercise", exercise=exercise_response)
    else:
        # Default to meal
        meal_estimate = classification.meal_data
        if not meal_estimate:
            from app.models.meal import MealEstimate
            meal_estimate = MealEstimate(food_items=[], calories=0)

        meal_response = await meals_repo.insert_meal(
            user_id=user_id,
            source=payload.source,
            raw_input=payload.raw_input,
            photo_url=payload.photo_url,
            idempotency_key=payload.idempotency_key,
            estimate=meal_estimate,
            ai_raw_response=raw,
        )
        return LogEntryResponse(type="meal", meal=meal_response)


@router.get("/exercises", response_model=list[ExerciseResponse])
async def list_exercises(
    date_value: date = Query(alias="date"), user_id: UUID = Depends(current_user_id)
):
    pool = await get_pool()
    repo = ExercisesRepo(pool)
    return await repo.get_exercises_for_day(user_id, date_value)


@router.delete("/entries")
async def delete_entries(
    date_value: date = Query(alias="date"),
    user_id: UUID = Depends(current_user_id),
):
    from datetime import datetime, timedelta, timezone
    pool = await get_pool()
    start = datetime(date_value.year, date_value.month, date_value.day, tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("delete from meals where user_id = $1 and logged_at >= $2 and logged_at < $3", user_id, start, end)
            await conn.execute("delete from exercises where user_id = $1 and logged_at >= $2 and logged_at < $3", user_id, start, end)
            await conn.execute("delete from water_logs where user_id = $1 and logged_at >= $2 and logged_at < $3", user_id, start, end)
            
    return {"status": "success", "message": f"Cleared all entries for {date_value}"}

