import asyncio
import logging

import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None
logger = logging.getLogger("caltrack.db")


async def get_pool() -> asyncpg.Pool:
    """Return the shared connection pool.

    On Vercel every cold-start is a fresh Python process, so _pool is None and
    a new pool is created.  Keep min_size=1 / max_size=1 so that each
    serverless instance holds at most ONE session connection against the
    PgBouncer limit (Supabase default: 15 session-mode connections).
    """
    global _pool
    if _pool is None:
        max_attempts = max(1, settings.db_connect_max_attempts)
        base_delay = max(0.0, settings.db_connect_retry_delay_seconds)
        last_error: Exception | None = None

        for attempt in range(1, max_attempts + 1):
            try:
                _pool = await asyncpg.create_pool(
                    settings.database_url,
                    min_size=1,
                    max_size=1,          # 1 connection per serverless instance
                    statement_cache_size=0,  # required for PgBouncer session mode
                )
                break
            except Exception as exc:
                last_error = exc
                if attempt == max_attempts:
                    logger.error(
                        "Database connection failed after %s attempt(s): %s",
                        max_attempts,
                        exc,
                    )
                    break

                sleep_seconds = base_delay * attempt
                logger.warning(
                    "Database connection attempt %s/%s failed: %s. Retrying in %.1fs",
                    attempt,
                    max_attempts,
                    exc,
                    sleep_seconds,
                )
                await asyncio.sleep(sleep_seconds)

        if _pool is None and last_error is not None:
            raise last_error
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
