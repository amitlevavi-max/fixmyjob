-- ─────────────────────────────────────────────────────────────────────────────
-- Short courses: supervisor-job courses must fit the user's trade (Amit, 2026-10-27)
--
-- Problem: an electrician in Austin got "Ceramic Tile Flooring" as a Quick win.
-- Its main listed job is 47-1011 First-Line Supervisors of Construction Trades —
-- the one supervisor code for EVERY construction trade — and that code is one of
-- the electrician's promotions, so any trade's course tagged with it qualified.
--
-- Rule: when a course's main job is a first-line supervisor code (SOC major
-- groups 33–53, minor group 1: 33-1…, 35-1…, 37-1…, 39-1…, 41-1…, 43-1…,
-- 45-1…, 47-1…, 49-1…, 51-1…, 53-1…) and that isn't the user's own job, the
-- course counts only if
--   * it is a leadership / supervision course (supervisor, leadership,
--     management, foreman, crew or team lead), or
--   * it also lists the user's own job.
-- Same body as 20261027000000_job_offers_course_distance.sql otherwise.
--
-- Revert: re-run the short_courses function from 20261027000000_job_offers_course_distance.sql;
--         drop function public.course_is_supervisor_soc(text); drop function public.course_is_leadership(text);
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.course_is_supervisor_soc(p_soc text)
returns boolean
language sql immutable
as $$
  select coalesce(p_soc, '') ~ '^(3[3579]|4[13579]|5[13])-1';
$$;

create or replace function public.course_is_leadership(p_text text)
returns boolean
language sql immutable
as $$
  select coalesce(p_text, '') ~* '\m(supervis\w*|leader\w*|management|manager\w*|managing|foreman|foremen|forewoman|crew lead\w*|team lead\w*|lead(ing)? (a |your )?(team|crew)s?)\M';
$$;

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
      -- A course whose main job is a trade-wide supervisor code (e.g. 47-1011 "First-Line Supervisors of
      -- Construction Trades") counts toward the user's promotion only when it is a leadership course or
      -- also lists the user's own job — not, say, a tile course for an electrician (Amit, 2026-10-27)
      and not (for_soc is distinct from p_own_soc
               and course_is_supervisor_soc(for_soc)
               and not course_is_leadership(coalesce(credential, '') || ' ' || name)
               and not (p_own_soc is not null and p_own_soc = any(socs)))
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
