from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import jwt
from fastapi import HTTPException, Request
from starlette import status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import settings


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._jwk_client = jwt.PyJWKClient(
            settings.supabase_jwks_url or f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
        )

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Any]]):
        if request.method == "OPTIONS" or request.url.path in {"/health", "/docs", "/openapi.json", "/redoc"}:
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"detail": "Missing bearer token"}, status_code=status.HTTP_401_UNAUTHORIZED)

        token = auth_header.replace("Bearer ", "", 1)
        try:
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=settings.supabase_jwt_audience,
                options={"verify_exp": True},
            )
        except Exception as e:
            print(f"Token decoding failed: {type(e).__name__}: {e}")
            return JSONResponse({"detail": f"Invalid token: {e}"}, status_code=status.HTTP_401_UNAUTHORIZED)

        sub = payload.get("sub")
        if not sub:
            return JSONResponse({"detail": "Invalid token payload"}, status_code=status.HTTP_401_UNAUTHORIZED)
        request.state.user_id = UUID(sub)
        return await call_next(request)


def current_user_id(request: Request) -> UUID:
    user_id = getattr(request.state, "user_id", None)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    return user_id
