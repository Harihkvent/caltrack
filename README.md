# caltrack

AI calorie tracker scaffold with FastAPI backend, Supabase schema, and infra cron templates.

## Structure

- `/backend` — FastAPI API, services, repositories, and SQL migrations.
- `/infra/github-actions` — keep-warm and weekly-backup workflow templates.

## Quick start (backend)

1. `cd /home/runner/work/caltrack/caltrack/backend`
2. `python -m venv .venv && source .venv/bin/activate`
3. `pip install -r requirements.txt`
4. Set env vars:
   - `DATABASE_URL`
   - `SUPABASE_URL`
   - `SUPABASE_JWKS_URL` (optional if `SUPABASE_URL` set)
   - `SUPABASE_JWT_AUDIENCE` (default `authenticated`)
   - `GEMINI_API_KEY`
5. `uvicorn app.main:app --reload`

## Apply schema

Run `/home/runner/work/caltrack/caltrack/backend/migrations/001_init.sql` in Supabase SQL editor.