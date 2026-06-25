import asyncpg

from app.config import settings

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Return the shared connection pool.

    On Vercel every cold-start is a fresh Python process, so _pool is None and
    a new pool is created.  Keep min_size=1 / max_size=1 so that each
    serverless instance holds at most ONE session connection against the
    PgBouncer limit (Supabase default: 15 session-mode connections).
    """
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.database_url,
            min_size=1,
            max_size=1,          # 1 connection per serverless instance
            statement_cache_size=0,  # required for PgBouncer session mode
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
