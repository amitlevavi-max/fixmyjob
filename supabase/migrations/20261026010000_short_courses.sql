-- ─────────────────────────────────────────────────────────────────────────────
-- Short courses = certification Quick wins (Amit, 2026-10-26)
--
-- A course counts as a Quick win when it is
--   * online and under 30 hours in total, or
--   * in person / hybrid within 10 miles of the user, at most 6 weeks and at
--     most 48 hours in total ("6 meetings or less": DOL records no meeting
--     count, so 6 meetings = at most 6 full days of 8 hours).
--
-- Hours: DOL's DE113 "program length – hours" is, in practice, hours PER WEEK
-- for most providers (checked 2026-10-26 against programs with the hours in
-- their name: 754 per week vs 119 total). Total = hours × weeks (1 week min).
-- Fewer than 3 hours in total is treated as misreported and skipped.
--
-- After `npx supabase db push`, load the hours:
--   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
--   $env:SUPABASE_SERVICE_ROLE_KEY="<secret key>"
--   node scripts/import-program-hours.mjs
--
-- Revert: drop function public.short_courses(text[], text, text, double precision, double precision, int);
--         drop function public.set_program_hours(jsonb);
--         alter table public.training_programs drop column hours_per_week;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.training_programs add column if not exists hours_per_week numeric;

-- Bulk load of hours (import script, service role only)
create or replace function public.set_program_hours(p jsonb)
returns int
language sql
security definer
set search_path = public
as $$
  with v as (select key as id, value::text::numeric as h from jsonb_each(p)),
  u as (update training_programs t set hours_per_week = v.h from v where t.id = v.id returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.set_program_hours(jsonb) from public, anon, authenticated;

-- Short courses for a set of occupations (the user's own job + the jobs of their
-- suggested moves). The user's own job: the program kind that trains people INTO
-- that job (its most common program type, e.g. nurse aide training for nursing
-- assistants) is left out — they already do the job.
-- Order: near first, then online in the user's state, then online elsewhere;
-- then fewer hours, then better completion.
create or replace function public.short_courses(
  p_socs text[], p_own_soc text default null, p_state text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_limit int default 5
)
returns jsonb
language sql stable
set search_path = public
as $$
  with entry as (
    select cip from training_programs
    where p_own_soc is not null and p_own_soc = any(socs)
    group by cip order by count(*) desc limit 1
  ),
  c as (
    select t.*,
           t.hours_per_week * greatest(t.weeks, 1) as total_hours,
           case when p_lat is not null and t.lat is not null
                then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
           (select s from unnest(t.socs) s where s = any(p_socs) limit 1) as for_soc
    from training_programs t
    where t.socs && p_socs
      and t.hours_per_week is not null and t.weeks is not null
  ),
  q as (
    select * from c
    where total_hours >= 3
      and not (p_own_soc is not null and for_soc = p_own_soc and cip = (select cip from entry)
               and not exists (select 1 from unnest(socs) s where s = any(p_socs) and s <> p_own_soc))
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null and distance_mi <= 10
            and weeks <= 6 and total_hours <= 48)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state'), '[]'::jsonb)
  from (
    select * from q
    order by (format <> 'online') desc,
             (state = p_state) desc,
             total_hours asc,
             completion_rate desc nulls last
    limit greatest(1, least(p_limit, 20))
  ) x;
$$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int) to anon, authenticated;
