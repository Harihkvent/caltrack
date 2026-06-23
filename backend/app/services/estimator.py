import json
import re
from typing import Any, Literal

import httpx
from fastapi import HTTPException, status

from app.config import settings
from app.models.meal import MealEstimate


class EstimationFailed(Exception):
    pass


class EstimatorService:
    def __init__(self):
        self.url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
        )

    async def estimate(self, source: Literal["text", "photo"], raw_input: str | None, photo_url: str | None) -> tuple[MealEstimate, dict]:
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Estimator is not configured",
            )

        prompt = self._build_prompt(source, raw_input, photo_url)
        response = await self._call_gemini(prompt)
        parsed = self._parse(response)
        return parsed, response

    def _build_prompt(self, source: Literal["text", "photo"], raw_input: str | None, photo_url: str | None) -> str:
        input_line = f"text='{raw_input}'" if source == "text" else f"image_url='{photo_url}', caption='{raw_input or ''}'"
        return (
            "You are a nutrition estimator. Return ONLY strict JSON and no markdown.\n"
            "Schema: {food_items:[{name,qty,calories,protein_g,carbs_g,fat_g}],calories,protein_g,carbs_g,fat_g,confidence}\n"
            "Rules: calories is int; macros are numbers in grams; confidence is 0-1.\n"
            f"Input: {input_line}"
        )

    async def _call_gemini(self, prompt: str) -> dict:
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2},
        }
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

    def _parse(self, raw: dict[str, Any]) -> MealEstimate:
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
        return MealEstimate.model_validate(data)
