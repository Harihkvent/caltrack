create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id),
  display_name text not null,
  daily_calorie_goal int default 2000,
  daily_protein_goal_g int default 100,
  created_at timestamptz default now()
);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  idempotency_key uuid not null,
  source text not null check (source in ('text','photo')),
  raw_input text,
  photo_url text,
  food_items jsonb,
  calories int not null,
  protein_g numeric(6,1),
  carbs_g numeric(6,1),
  fat_g numeric(6,1),
  confidence numeric(3,2),
  ai_raw_response jsonb,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists meals_user_day_idx on meals (user_id, logged_at);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id)
);

create table if not exists group_members (
  group_id uuid references groups(id),
  user_id uuid references profiles(id),
  primary key (group_id, user_id)
);

alter table meals enable row level security;

drop policy if exists "users read own meals" on meals;
create policy "users read own meals"
  on meals for select using (auth.uid() = user_id);

drop policy if exists "users insert own meals" on meals;
create policy "users insert own meals"
  on meals for insert with check (auth.uid() = user_id);
