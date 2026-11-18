-- Claim my rights (2026-10-21)
--
-- 1. worker_rights_answers — the user's answers to the Claim my rights
--    questions (work type, shifts, breaks, deductions, retaliation, union…).
--    Sensitive, so NOT in user_profiles: its own table with row-level security
--    from day one — each user can read and change only their own row.
-- 2. feature_interest — taps on buttons for features that aren't built yet
--    ("Faster: add a photo of your pay stub", "Talk to a lawyer"). Insert-only
--    from the app; read the counts in the SQL editor:
--      select * from feature_interest_summary;

-- ── 1. Rights answers ───────────────────────────────────────────────────────
create table if not exists public.worker_rights_answers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  answers     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.worker_rights_answers enable row level security;
revoke all on public.worker_rights_answers from anon, authenticated;
grant select, insert, update, delete on public.worker_rights_answers to authenticated;

drop policy if exists "rights answers: read own" on public.worker_rights_answers;
create policy "rights answers: read own" on public.worker_rights_answers
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "rights answers: insert own" on public.worker_rights_answers;
create policy "rights answers: insert own" on public.worker_rights_answers
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "rights answers: update own" on public.worker_rights_answers;
create policy "rights answers: update own" on public.worker_rights_answers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "rights answers: delete own" on public.worker_rights_answers;
create policy "rights answers: delete own" on public.worker_rights_answers
  for delete to authenticated using (user_id = auth.uid());

-- ── 2. Feature interest (demand test) ───────────────────────────────────────
create table if not exists public.feature_interest (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  feature     text not null check (feature in ('pay_stub_reading', 'talk_to_lawyer')),
  screen      text,                       -- e.g. task_detail
  context     text,                       -- e.g. the right the user was looking at
  platform    text                        -- android / ios
);

create index if not exists feature_interest_feature_idx on public.feature_interest (feature, created_at desc);

alter table public.feature_interest enable row level security;
revoke all on public.feature_interest from anon, authenticated;
grant insert (user_id, feature, screen, context, platform) on public.feature_interest to anon, authenticated;

drop policy if exists "feature interest: insert own" on public.feature_interest;
create policy "feature interest: insert own" on public.feature_interest
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Flood guard: at most 60 taps per user per hour
create or replace function public.feature_interest_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (
    select count(*) from public.feature_interest
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'Too many taps — please try again later.';
  end if;
  return new;
end $$;

drop trigger if exists feature_interest_rate_limit on public.feature_interest;
create trigger feature_interest_rate_limit
  before insert on public.feature_interest
  for each row execute function public.feature_interest_rate_limit();

-- Taps and unique users per feature (read with the service role / SQL editor)
create or replace view public.feature_interest_summary
with (security_invoker = true) as
select
  feature,
  count(*)                                                     as taps,
  count(distinct user_id)                                      as unique_users,
  count(*) filter (where created_at > now() - interval '7 days') as taps_last_7_days,
  count(distinct user_id) filter (where created_at > now() - interval '7 days') as users_last_7_days,
  min(created_at)                                              as first_tap,
  max(created_at)                                              as last_tap
from public.feature_interest
group by feature
order by feature;

revoke all on public.feature_interest_summary from anon, authenticated;
