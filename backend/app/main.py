from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import router
from app.auth import AuthMiddleware
from app.config import settings
from app.db import close_pool, get_pool


@asynccontextmanager
async def lifespan(_: FastAPI):
    await get_pool()
    yield
    await close_pool()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(AuthMiddleware)
app.include_router(router)
