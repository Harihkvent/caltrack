from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import current_user_id
from app.db import get_pool
from app.models.meal import CreateMealRequest, MealResponse, SummaryResponse, PatchMealRequest
from app.models.profile import GoalsPatchRequest, ProfileResponse
from app.models.weight import LogWeightRequest, WeightLogResponse
from app.models.water import LogWaterRequest, WaterLogResponse, WaterDailySummary
from app.models.exercise import ExerciseResponse, LogEntryResponse, PatchExerciseRequest
from app.models.dashboard import DashboardResponse
from app.repos.profiles_repo import ProfilesRepo
from app.repos.weight_repo import WeightRepo
from app.repos.water_repo import WaterRepo
from app.repos.meals_repo import MealsRepo
from app.repos.exercises_repo import ExercisesRepo
from app.services.estimator import EstimatorService, EstimationFailed
from app.services.meal_service import MealService
from asyncio import gather

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


@router.delete("/meals/{meal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meal(meal_id: UUID, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = MealsRepo(pool)
    deleted = await repo.delete_meal(user_id, meal_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")


@router.patch("/meals/{meal_id}", response_model=MealResponse)
async def patch_meal(
    meal_id: UUID,
    payload: PatchMealRequest,
    user_id: UUID = Depends(current_user_id),
):
    pool = await get_pool()
    repo = MealsRepo(pool)
    updated = await repo.update_meal(user_id, meal_id, payload.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meal not found")
    return updated


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(exercise_id: UUID, user_id: UUID = Depends(current_user_id)):
    pool = await get_pool()
    repo = ExercisesRepo(pool)
    deleted = await repo.delete_exercise(user_id, exercise_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")


@router.patch("/exercises/{exercise_id}", response_model=ExerciseResponse)
async def patch_exercise(
    exercise_id: UUID,
    payload: PatchExerciseRequest,
    user_id: UUID = Depends(current_user_id),
):
    pool = await get_pool()
    repo = ExercisesRepo(pool)
    updated = await repo.update_exercise(user_id, exercise_id, payload.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return updated


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


@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    date_value: date = Query(alias="date"),
    user_id: UUID = Depends(current_user_id)
):
    pool = await get_pool()
    profiles_repo = ProfilesRepo(pool)
    meals_repo = MealsRepo(pool)
    exercises_repo = ExercisesRepo(pool)
    water_repo = WaterRepo(pool)
    weight_repo = WeightRepo(pool)
    
    # Fetch all data concurrently using database pool
    profile, meals, exercises, water, weight_history, summary = await gather(
        profiles_repo.get_profile(user_id),
        meals_repo.get_meals_for_day(user_id, date_value),
        exercises_repo.get_exercises_for_day(user_id, date_value),
        water_repo.get_today_water(user_id, date_value),
        weight_repo.get_weight_history(user_id),
        meals_repo.get_summary(user_id, "week")
    )
    
    return DashboardResponse(
        profile=profile,
        meals=meals,
        exercises=exercises,
        water=water,
        weight_history=weight_history,
        summary=summary
    )


