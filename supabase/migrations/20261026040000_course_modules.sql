-- ─────────────────────────────────────────────────────────────────────────────
-- Skip courses that are one part of a longer program (Amit, 2026-10-26)
--
-- A short course must stand on its own. Left out: a name that starts with a
-- course code ("Alr 108 Obstetrics", "NUR 101", "BIO-210" — not "CDL 40 Hour Refresher"), or a numbered part
-- ("Basic Nursing I", "Part 2", "Module 3", "Level 1", "Semester 1", "Unit 4").
-- National certifications (OSHA 10, …) are never treated as parts.
--
-- Revert: re-run short_courses from 20261026030000_state_specific_courses.sql;
--         drop function public.course_is_module(text); drop table public.course_suggest_cache;
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.course_is_module(p_name text)
returns boolean
language sql immutable
as $$
  select coalesce(p_name, '') ~* '^\s*[A-Za-z]{2,5}[- ]?\d{2,4}[A-Za-z]?\M(?!\s*-?\s*(hours?|hrs?)\M)'
      or coalesce(p_name, '') ~* '\m(I|II|III|IV|V)\s*(\(|$)'
      or coalesce(p_name, '') ~* '\m(part|module|level|unit|semester|term|block|phase|course)\s+(\d+|one|two|three|four|I|II|III|IV)\M';
$$;

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
           (select s from unnest(t.socs) s where s = any(p_socs) limit 1) as for_soc,
           course_is_national(coalesce(t.credential, '') || ' ' || t.name) as national,
           course_is_module(t.name) as module
    from training_programs t
    where t.socs && p_socs
      and t.hours_per_week is not null and t.weeks is not null
  ),
  q as (
    select * from c
    where total_hours >= 3
      -- a length that can't be right for the price (DOL records are sometimes misreported)
      and (coalesce(tuition, 0) <= 0 or tuition / total_hours <= 150)
      and not (p_own_soc is not null and for_soc = p_own_soc and cip = (select cip from entry)
               and not exists (select 1 from unnest(socs) s where s = any(p_socs) and s <> p_own_soc))
      -- one part of a longer program ("NUR 101", "Basic Nursing I", "Module 2") — not a course on its own
      and not (module and not national)
      -- another state's course whose certificate only counts there
      and not (p_state is not null and state is distinct from p_state and not national
               and course_state_only(coalesce(credential, '') || ' ' || name, p_state))
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null and distance_mi <= 10
            and weeks <= 6 and total_hours <= 48)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national' - 'module'), '[]'::jsonb)
  from (
    select * from q
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
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int) to anon, authenticated;

-- AI web-search fallback (Edge Function suggest-course): used only when the DOL
-- list has no valid short course for the user. Cached 30 days per job + place +
-- next jobs. Only the Edge Function (service role) reads and writes it.
create table if not exists public.course_suggest_cache (
  key          text primary key,          -- soc|state|city or zip|target socs
  request      jsonb not null,            -- what was asked (no personal data beyond job, pay band, place)
  results      jsonb not null,            -- [{name, provider, format, location, duration, hours, price, price_source, credential, why, url, phone, email, sources}]
  model        text,
  searched_at  timestamptz not null default now()
);
alter table public.course_suggest_cache enable row level security;
