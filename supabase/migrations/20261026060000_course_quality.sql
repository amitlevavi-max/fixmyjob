-- ─────────────────────────────────────────────────────────────────────────────
-- Better short-course picks (Amit, 2026-10-27)
--
--  * Skip courses for people who already hold the credential: in-service,
--    refresher, renewal, recertification, continuing education, CEU —
--    unless the course is also for newcomers ("Initial & Renewal").
--  * A course counts only for its MAIN listed occupation (the first of the up
--    to 3 a provider may list), so loose tags don't make odd matches.
--  * Order of jobs: the user's own job, then promotions (new p_promo_socs);
--    courses for career-change jobs only when those give nothing.
--
-- Revert: drop function public.short_courses(text[], text, text, double precision, double precision, int, text[]);
--         drop function public.course_is_refresher(text);
--         re-run short_courses from 20261026050000_short_courses_speed.sql
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.course_is_refresher(p_text text)
returns boolean
language sql immutable
as $$
  select coalesce(p_text, '') ~* '\m(in-?service|refresher|renewal|re-?certif\w*|recert\w*|continuing (education|ed)|CEUs?|CE credits?)\M'
     and coalesce(p_text, '') !~* '\m(initial|new|first[- ]time)\M';
$$;

-- The old 6-argument version is replaced (calls without p_promo_socs still work: it defaults to none)
drop function if exists public.short_courses(text[], text, text, double precision, double precision, int);

create or replace function public.short_courses(
  p_socs text[], p_own_soc text default null, p_state text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_limit int default 5, p_promo_socs text[] default null
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
  -- 1. cheap filters first (length, format, distance, price) — materialized so the text checks below see only these rows
  c as materialized (
    select * from (
      select t.*,
             t.hours_per_week * greatest(t.weeks, 1) as total_hours,
             case when p_lat is not null and t.lat is not null
                  then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
             -- the course counts only for its MAIN listed occupation (DOL lets providers list up to 3; the others are often loose)
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
        or (format <> 'online' and distance_mi is not null and distance_mi <= 10
            and weeks <= 6 and total_hours <= 48)
      )
  ),
  -- 2. text checks on what is left
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
      -- one part of a longer program — not a course on its own
      and not (module and not national)
      -- another state's course whose certificate only counts there
      and not (other_state_only and not national)
      -- for people who already hold the credential (in-service, refresher, renewal…)
      and not refresher
  ),
  -- own job first, then promotions; career-change jobs only when those give nothing
  best as (select * from q where tier = (select min(tier) from q))
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national' - 'module' - 'other_state_only' - 'refresher' - 'tier'), '[]'::jsonb)
  from (
    select * from best
    order by (format <> 'online') desc,
             (state = p_state) desc,
             national desc,                -- valid in every state
             (url is not null) desc,
             (completion_rate is not null or median_q2_earnings is not null) desc,
             total_hours asc,
             completion_rate desc nulls last
    limit greatest(1, least(p_limit, 20))
  ) x;
$$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int, text[]) to anon, authenticated;
