-- 003_exercises.sql

-- Create exercises table
create table if not exists exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  calories_burned int not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Enable RLS on exercises
alter table exercises enable row level security;

-- Policies for exercises
drop policy if exists "users read own exercises" on exercises;
create policy "users read own exercises"
  on exercises for select using (auth.uid() = user_id);

drop policy if exists "users insert own exercises" on exercises;
create policy "users insert own exercises"
  on exercises for insert with check (auth.uid() = user_id);

create index if not exists exercises_user_idx on exercises (user_id, logged_at);
