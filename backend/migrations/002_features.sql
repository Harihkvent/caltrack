-- 002_features.sql

-- Create weight logs table
create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  weight_kg numeric(5,2) not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Enable RLS on weight logs
alter table weight_logs enable row level security;

-- Policies for weight logs
drop policy if exists "users read own weight" on weight_logs;
create policy "users read own weight"
  on weight_logs for select using (auth.uid() = user_id);

drop policy if exists "users insert own weight" on weight_logs;
create policy "users insert own weight"
  on weight_logs for insert with check (auth.uid() = user_id);

create index if not exists weight_logs_user_idx on weight_logs (user_id, logged_at);

-- Create water logs table
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount_ml int not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Enable RLS on water logs
alter table water_logs enable row level security;

-- Policies for water logs
drop policy if exists "users read own water" on water_logs;
create policy "users read own water"
  on water_logs for select using (auth.uid() = user_id);

drop policy if exists "users insert own water" on water_logs;
create policy "users insert own water"
  on water_logs for insert with check (auth.uid() = user_id);

create index if not exists water_logs_user_idx on water_logs (user_id, logged_at);
