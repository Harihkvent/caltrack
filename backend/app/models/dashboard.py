from pydantic import BaseModel
from app.models.profile import ProfileResponse
from app.models.meal import MealResponse, SummaryResponse
from app.models.exercise import ExerciseResponse
from app.models.weight import WeightLogResponse
from app.models.water import WaterDailySummary

class DashboardResponse(BaseModel):
    profile: ProfileResponse | None = None
    meals: list[MealResponse]
    exercises: list[ExerciseResponse]
    water: WaterDailySummary
    weight_history: list[WeightLogResponse]
    summary: SummaryResponse
