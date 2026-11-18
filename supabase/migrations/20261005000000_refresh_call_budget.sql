-- Count BLS API calls per refresh run, so the Edge Function can stay under the
-- 500 calls/day limit while running hourly.
alter table public.benchmark_refresh_log
  add column if not exists api_calls integer not null default 0;

create index if not exists benchmark_refresh_log_started
  on public.benchmark_refresh_log (started_at desc);
