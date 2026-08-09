-- 004_db_heartbeat.sql

create table if not exists db_heartbeat (
  id boolean primary key default true,
  last_seen timestamptz not null default now(),
  source text not null default 'github-actions'
);
