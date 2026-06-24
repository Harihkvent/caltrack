import json
import re
from base64 import b64encode
from typing import Any, Literal

import httpx
from fastapi import HTTPException, status
from pydantic import BaseModel

from app.config import settings
from app.models.meal import MealEstimate
from app.models.exercise import ExerciseEstimate


class ClassificationResponse(BaseModel):
    type: Literal["meal", "exercise"]
    meal_data: MealEstimate | None = None
    exercise_data: ExerciseEstimate | None = None


class EstimationFailed(Exception):
    pass


class EstimatorService:
    def __init__(self):
        self.url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )

    async def estimate(self, source: Literal["text", "photo"], raw_input: str | None, photo_url: str | None) -> tuple[ClassificationResponse, dict]:
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Estimator is not configured",
            )

        prompt = self._build_prompt(source, raw_input, photo_url)
        response = await self._call_gemini(prompt, source, photo_url)
        try:
            parsed = self._parse(response)
            return parsed, response
        except EstimationFailed:
            retry_prompt = prompt + "\nYour previous answer was invalid. Return only valid JSON matching the schema."
            retry_response = await self._call_gemini(retry_prompt, source, photo_url)
            parsed = self._parse(retry_response)
            return parsed, retry_response

    def _build_prompt(self, source: Literal["text", "photo"], raw_input: str | None, photo_url: str | None) -> str:
        input_line = f"text='{raw_input}'" if source == "text" else f"image_url='{photo_url}', caption='{raw_input or ''}'"
        return (
            "You are a health and activity classifier and estimator. Return ONLY strict JSON and no markdown.\n"
            "Analyze the input to determine if it is a food/meal entry ('meal') or an exercise/workout/activity entry ('exercise').\n"
            "Rules:\n"
            "1. If it's a food/drink/meal description or food photo, classify type as 'meal'. Output estimated nutrition values.\n"
            "2. If it's a physical activity/workout/exercise description, classify type as 'exercise'. Output exercise name and estimated calories burned.\n"
            "3. If it's ambiguous or both, default to 'meal'.\n\n"
            "JSON Response Schema:\n"
            "{\n"
            '  "type": "meal" or "exercise",\n'
            '  "meal_data": {\n'
            '    "food_items": [{"name": string, "qty": string/int/null, "calories": int, "protein_g": float, "carbs_g": float, "fat_g": float, "sugar_g": float, "fiber_g": float, "sodium_mg": float}],\n'
            '    "calories": int,\n'
            '    "protein_g": float,\n'
            '    "carbs_g": float,\n'
            '    "fat_g": float,\n'
            '    "sugar_g": float,\n'
            '    "fiber_g": float,\n'
            '    "sodium_mg": float,\n'
            '    "confidence": float (0-1)\n'
            "  },\n"
            '  "exercise_data": {\n'
            '    "name": string,\n'
            '    "calories_burned": int,\n'
            '    "confidence": float (0-1)\n'
            "  }\n"
            "}\n\n"
            "Provide meal_data if type is 'meal', otherwise set to null or omit. Provide exercise_data if type is 'exercise', otherwise set to null or omit.\n\n"
            f"Input: {input_line}"
        )

    async def _call_gemini(self, prompt: str, source: Literal["text", "photo"], photo_url: str | None) -> dict:
        parts: list[dict[str, Any]] = [{"text": prompt}]
        if source == "photo" and photo_url:
            image_part = await self._image_part(photo_url)
            if image_part:
                parts.append(image_part)
        payload = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0.2}}
        timeout = httpx.Timeout(20.0, connect=10.0)
        retries = 2
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(retries):
                res = await client.post(self.url, json=payload)
                if res.status_code == 429 and attempt < retries - 1:
                    continue
                if res.is_error:
                    raise EstimationFailed(f"gemini_error:{res.status_code}:{res.text}")
                return res.json()
        raise EstimationFailed("gemini_rate_limited")

    async def _image_part(self, photo_url: str) -> dict[str, Any] | None:
        if photo_url.startswith("data:image/"):
            header, _, encoded = photo_url.partition(",")
            mime = header.split(";")[0].replace("data:", "")
            return {"inlineData": {"mimeType": mime, "data": encoded}}
        if not photo_url.startswith(("http://", "https://")):
            return None
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            res = await client.get(photo_url)
            if res.is_error:
                return None
            mime = res.headers.get("content-type", "image/jpeg").split(";")[0]
            encoded = b64encode(res.content).decode("utf-8")
            return {"inlineData": {"mimeType": mime, "data": encoded}}

    def _parse(self, raw: dict[str, Any]) -> ClassificationResponse:
        try:
            text = raw["candidates"][0]["content"]["parts"][0]["text"]
        except Exception as exc:
            raise EstimationFailed("invalid_gemini_shape") from exc

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.DOTALL)

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            raise EstimationFailed("invalid_json") from exc
        return ClassificationResponse.model_validate(data)
