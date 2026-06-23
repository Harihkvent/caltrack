import json
import re
from base64 import b64encode
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
            "You are a nutrition estimator. Return ONLY strict JSON and no markdown.\n"
            "Schema: {food_items:[{name,qty,calories,protein_g,carbs_g,fat_g}],calories,protein_g,carbs_g,fat_g,confidence}\n"
            "Rules: calories is int; macros are numbers in grams; confidence is 0-1.\n"
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
