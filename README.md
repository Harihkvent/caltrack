# caltrack

AI calorie tracker scaffold with FastAPI backend, Supabase schema, and infra cron templates.

## Structure

- `/app` — Expo app (Android + web/PWA for iOS home-screen use).
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

Optional backend env:
- `APP_CORS_ORIGINS` (comma-separated origins, default `*`)

## Apply schema

Run `/home/runner/work/caltrack/caltrack/backend/migrations/001_init.sql` in Supabase SQL editor.

## Quick start (mobile/web app)

1. `cd /home/runner/work/caltrack/caltrack/app`
2. `cp .env.example .env` and fill the values
3. `npm install`
4. `npm run start` (or `npm run android` / `npm run web`)

Implemented app functionality:
- Email/password sign up + sign in via Supabase Auth
- Log meals by text or by photo (selected image encoded as data URL)
- Daily meal list by date
- Week/month summaries
- Goal fetch and update