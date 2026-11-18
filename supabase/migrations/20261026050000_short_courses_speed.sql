-- ─────────────────────────────────────────────────────────────────────────────
-- Speed up short_courses() (2026-10-26, night)
--
-- After 20261026030000/040000 the function timed out (3 s limit for app calls):
-- the text checks (state-only credentials, ~50 state names, course parts) ran on
-- every candidate course. Now:
--   * the cheap filters (length, format, distance, price) run first, in a
--     MATERIALIZED step, so the text checks only see the few courses left;
--   * the other-state check is ONE pattern built from the state names, not 50.
-- Same rules and order as before.
--
-- Revert: re-run course_state_only from 20261026030000 and short_courses from 20261026040000.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.course_state_only(p_text text, p_state text)
returns boolean
language sql immutable
as $$
  with s(abbr, name) as (values
    ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),('CA','California'),('CO','Colorado'),
    ('CT','Connecticut'),('DE','Delaware'),('DC','District of Columbia'),('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),
    ('ID','Idaho'),('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),('KY','Kentucky'),('LA','Louisiana'),
    ('ME','Maine'),('MD','Maryland'),('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),
    ('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),('NH','New Hampshire'),('NJ','New Jersey'),
    ('NM','New Mexico'),('NY','New York'),('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),
    ('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),('SD','South Dakota'),
    ('TN','Tennessee'),('TX','Texas'),('UT','Utah'),('VT','Vermont'),('VA','Virginia'),('WA','Washington'),
    ('WV','West Virginia'),('WI','Wisconsin'),('WY','Wyoming'))
  select coalesce(p_text, '') ~* ('\m(nurse aides?|nursing assistants?|nursing aides?|CNA|certified nursing|medication aides?|medication (technician|assistant)s?|QMA|CMT|home health aides?|HHA|nurse delegation|CBRF|personal care (aide|attendant)s?|direct care worker|cosmetolog\w*|barber\w*|esthetic\w*|aesthetic\w*|nail tech\w*|manicur\w*|real estate|insurance (licens\w*|pre-?licens\w*|producer)|pre-?licens\w*|security (guard|officer)s?|armed guard|notary|state board|state licens\w*|state certif\w*|state[- ]approved)\M')
      or coalesce(p_text, '') ~* (select '\m(' || string_agg(s.name, '|') || ')\M' from s where s.abbr is distinct from p_state);
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
  -- 1. cheap filters first (length, format, distance, price) — materialized so the text checks below see only these rows
  c as materialized (
    select * from (
      select t.*,
             t.hours_per_week * greatest(t.weeks, 1) as total_hours,
             case when p_lat is not null and t.lat is not null
                  then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
             (select s from unnest(t.socs) s where s = any(p_socs) limit 1) as for_soc
      from training_programs t
      where t.socs && p_socs
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
            and course_state_only(coalesce(c.credential, '') || ' ' || c.name, p_state)) as other_state_only
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
  )
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national' - 'module' - 'other_state_only'), '[]'::jsonb)
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
