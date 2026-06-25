import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.auth import AuthMiddleware
from app.config import settings
from app.db import close_pool, get_pool

# Configure root logger for clean, readable output
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("caltrack")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting up — connecting to database...")
    await get_pool()
    logger.info("Database pool ready ✓")
    yield
    logger.info("Shutting down — closing database pool...")
    await close_pool()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.app_cors_origins.split(",") if o.strip()] or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(AuthMiddleware)
app.include_router(router)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    method = request.method
    path = request.url.path
    query = f"?{request.url.query}" if request.url.query else ""
    logger.info(f"→ {method} {path}{query}")

    response = await call_next(request)

    elapsed_ms = (time.perf_counter() - start) * 1000
    status = response.status_code
    level = logging.WARNING if status >= 400 else logging.INFO
    logger.log(level, f"← {method} {path}{query}  {status}  ({elapsed_ms:.0f}ms)")
    return response
