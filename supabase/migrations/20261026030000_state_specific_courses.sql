-- ─────────────────────────────────────────────────────────────────────────────
-- No out-of-state courses that are known to be state-specific (Amit, 2026-10-26)
--
-- A course from another state (online, or in person across a state line) is not
-- suggested when we KNOW its certificate only counts in the state that approved
-- it: its name or credential is one that states license or certify themselves
-- (nurse aide / CNA, medication aide, home health aide, nurse delegation, CBRF,
-- cosmetology, barbering, real estate, insurance, security guard…), or it names
-- another state — unless it also leads to a national certification.
-- Courses we can't classify are still suggested, with the "check that the
-- certificate is accepted in <state>" step (lib/shortCourses).
--
-- Also: the national-certification match now uses whole words (before, short
-- names like ASE / AHA / BLS matched inside words such as "phase" or "disease").
--
-- Revert: re-run short_courses from 20261026020000_course_details.sql;
--         drop function public.course_is_national(text); drop function public.course_state_only(text, text);
-- ─────────────────────────────────────────────────────────────────────────────

-- Leads to a certification that is valid in every state
create or replace function public.course_is_national(p_text text)
returns boolean
language sql immutable
as $$
  select coalesce(p_text, '') ~* '\m(AMCA|NHA|NCCT|NCCER|AAPC|AHIMA|CompTIA|NIMS|OSHA|ServSafe|American Heart|AHA|BLS|CPR|Red Cross|First Aid|AWS|EPA 608|NATE|ASE|NREMT|PTCB|Microsoft|Google|Forklift)\M';
$$;

-- Known to count only in the state that approved it (p_state = the user's state, its own name is not "another state")
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
      or exists (select 1 from s where s.abbr is distinct from p_state
                 and coalesce(p_text, '') ~* ('\m' || s.name || '\M'));
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
           course_is_national(coalesce(t.credential, '') || ' ' || t.name) as national
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
      -- another state's course whose certificate only counts there
      and not (p_state is not null and state is distinct from p_state and not national
               and course_state_only(coalesce(credential, '') || ' ' || name, p_state))
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null and distance_mi <= 10
            and weeks <= 6 and total_hours <= 48)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national'), '[]'::jsonb)
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
