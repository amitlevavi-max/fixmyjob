-- ─────────────────────────────────────────────────────────────────────────────
-- Job offers "coming soon" + course driving distance (Amit, 2026-10-27)
--
--  1. feature_interest: new feature 'job_offers' — a tap on "Yes, send me
--     offers" is logged (the feature isn't built yet; the app says Coming soon).
--     Counts: select * from feature_interest_summary;
--  2. user_profiles.course_max_miles — how far the user will drive to an
--     in-person short course (10–100; empty = 10). Asked on the
--     "Find a short course near you" item when nothing was found within 10 miles.
--  3. short_courses(): new last argument p_max_miles (default 10) replaces the
--     fixed 10-mile limit for in-person courses; courses further than 10 miles
--     come nearest first. Everything else unchanged (same body as
--     20261026060000_course_quality.sql).
--
-- Revert: alter table public.feature_interest drop constraint feature_interest_feature_check;
--         alter table public.feature_interest add constraint feature_interest_feature_check
--           check (feature in ('pay_stub_reading', 'talk_to_lawyer'));
--         alter table public.user_profiles drop column course_max_miles;
--         drop function public.short_courses(text[], text, text, double precision, double precision, int, text[], int);
--         re-run short_courses from 20261026060000_course_quality.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Feature interest: job offers
alter table public.feature_interest drop constraint if exists feature_interest_feature_check;
alter table public.feature_interest add constraint feature_interest_feature_check
  check (feature in ('pay_stub_reading', 'talk_to_lawyer', 'job_offers'));

-- 2. Driving distance for courses
alter table public.user_profiles add column if not exists course_max_miles int
  check (course_max_miles is null or course_max_miles between 10 and 100);

-- 3. short_courses with a driving distance
drop function if exists public.short_courses(text[], text, text, double precision, double precision, int, text[]);

create or replace function public.short_courses(
  p_socs text[], p_own_soc text default null, p_state text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_limit int default 5, p_promo_socs text[] default null, p_max_miles int default 10
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
  c as materialized (
    select * from (
      select t.*,
             t.hours_per_week * greatest(t.weeks, 1) as total_hours,
             case when p_lat is not null and t.lat is not null
                  then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
             t.socs[1] as for_soc,
             case when t.socs[1] = p_own_soc then 0 when t.socs[1] = any(coalesce(p_promo_socs, '{}')) then 1 else 2 end as tier
      from training_programs t
      where t.socs && p_socs
        and t.socs[1] = any(p_socs)
        and t.hours_per_week is not null and t.weeks is not null
    ) a
    where total_hours >= 3
      and (coalesce(tuition, 0) <= 0 or tuition / total_hours <= 150)
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null
            and distance_mi <= least(100, greatest(10, coalesce(p_max_miles, 10)))
            and weeks <= 6 and total_hours <= 48)
      )
  ),
  d as materialized (
    select c.*,
           course_is_national(coalesce(c.credential, '') || ' ' || c.name) as national,
           course_is_module(c.name) as module,
           (p_state is not null and c.state is distinct from p_state
            and course_state_only(coalesce(c.credential, '') || ' ' || c.name, p_state)) as other_state_only,
           course_is_refresher(coalesce(c.credential, '') || ' ' || c.name) as refresher
    from c
  ),
  q as (
    select * from d
    where not (p_own_soc is not null and for_soc = p_own_soc and cip = (select cip from entry)
               and not exists (select 1 from unnest(socs) s where s = any(p_socs) and s <> p_own_soc))
      and not (module and not national)
      and not (other_state_only and not national)
      and not refresher
  ),
  best as (select * from q where tier = (select min(tier) from q))
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national' - 'module' - 'other_state_only' - 'refresher' - 'tier'), '[]'::jsonb)
  from (
    select * from best
    order by (format <> 'online') desc,
             (state = p_state) desc,
             national desc,
             (url is not null) desc,
             (completion_rate is not null or median_q2_earnings is not null) desc,
             -- beyond 10 miles (only when the user drives further): nearest first; within 10 miles the order is unchanged
             case when distance_mi > 10 then distance_mi end asc nulls first,
             total_hours asc,
             completion_rate desc nulls last
    limit greatest(1, least(p_limit, 20))
  ) x;
$$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int, text[], int) to anon, authenticated;
