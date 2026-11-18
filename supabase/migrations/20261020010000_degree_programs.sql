-- ─────────────────────────────────────────────────────────────────────────────
-- Education needed for a move, and degree programs that lead to an occupation
-- (decisions with Amit, 2026-10-20; claude/career-paths.md)
--
-- 1. occupation_education  O*NET "Required Level of Education" (scale RL) per
--                          occupation: the most common level and its share.
--                          Filled by refresh-benchmarks {"job":"careerpaths"}.
--    Levels (O*NET RL categories): 1 less than high school · 2 high school ·
--    3 post-secondary certificate · 4 some college · 5 associate · 6 bachelor's ·
--    7 post-baccalaureate certificate · 8 master's · 9 post-master's certificate ·
--    10 first professional · 11 doctoral · 12 post-doctoral
--
-- 2. degree_programs       college programs (associate degree and up) that lead
--                          to an occupation. Loaded by scripts/import-degree-programs.mjs:
--   - which schools award the program: IPEDS Completions (6-digit CIP, award level)
--   - which occupations it leads to: NCES CIP 2020 → SOC 2018 crosswalk
--   - earnings after graduating, student debt, online: College Scorecard
--     field-of-study file (4-digit CIP family × credential level — the
--     figures are for the program family at that school, e.g. "Registered
--     Nursing, Nursing Administration…" for a nurse-midwifery master's)
--   - school name, city, map point, website: IPEDS Institutional Characteristics (HD)
--   - tuition and fees (graduate or undergraduate, in-state / out-of-state): IPEDS IC_AY
--   No program length or completion / pass rates: no national data for them.
--
-- 3. degree_options(soc, min_level, max_level, state, lat, lon) — what the app calls.
-- 4. career_links() now also returns the current and target job's typical education.
--
-- Revert: drop function degree_options; drop table degree_programs, occupation_education;
--         re-run career_links from 20261019000000_career_paths.sql
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.occupation_education (
  soc            text primary key,
  typical_level  smallint not null check (typical_level between 1 and 12),
  typical_share  numeric,                     -- % of O*NET respondents naming that level
  levels         numeric[],                   -- % per level 1..12
  onet_codes     text[],
  onet_version   text,
  updated_at     timestamptz not null default now()
);

create table if not exists public.degree_programs (
  id              text primary key,           -- unitid|cip|award_level
  unitid          text not null,
  school          text not null,
  cip             text not null,              -- 6-digit CIP 2020, e.g. '51.3807'
  cip_title       text,
  award_level     text not null,              -- associate | bachelor | post_bacc_cert | master | post_master_cert | doctor_professional | doctor_research | doctor_other
  onet_level      smallint not null,          -- same scale as occupation_education.typical_level
  socs            text[] not null,            -- OEWS occupations it leads to (crosswalk)
  graduates       integer,                    -- awards in the latest IPEDS year (first major)
  state           text,                       -- 'NJ'
  city            text,
  lat             double precision,
  lon             double precision,
  url             text,
  online          text,                       -- 'full' (all by distance) | 'partial' | null (Scorecard DISTANCE 3 / 2)
  earnings_field  text,                       -- the Scorecard program family the figures below describe
  earn_1yr        numeric,                    -- median yearly earnings, 1 year after completing
  earn_5yr        numeric,                    -- 5 years after (4 when 5 is not published)
  earn_n          integer,                    -- graduates behind the 1-year figure
  debt_median     numeric,                    -- median federal student debt (Stafford + Grad PLUS) at this school
  debt_monthly    numeric,                    -- estimated monthly payment on that debt (10-year plan)
  tuition_in      numeric,                    -- yearly tuition + fees, in-state (graduate rate for graduate programs)
  tuition_out     numeric,                    -- out-of-state
  data_year       text,                       -- 'IPEDS 2024 · Scorecard 2026-10'
  imported_at     timestamptz not null default now()
);
create index if not exists degree_programs_socs_idx on public.degree_programs using gin (socs);
create index if not exists degree_programs_state_idx on public.degree_programs (state);

alter table public.occupation_education enable row level security;
alter table public.degree_programs enable row level security;
drop policy if exists "read occupation_education" on public.occupation_education;
create policy "read occupation_education" on public.occupation_education for select using (true);
drop policy if exists "read degree_programs" on public.degree_programs;
create policy "read degree_programs" on public.degree_programs for select using (true);

-- ── Degree programs for one occupation ─────────────────────────────────────
-- Nearest first when a map point is given (ZIP or metro), else in the user's
-- state first; then by number of graduates. Fully-online programs listed apart.
-- p_state = state abbreviation ('NJ'); levels on the O*NET RL scale.
create or replace function public.degree_options(
  p_soc text, p_min_level int, p_max_level int,
  p_state text default null, p_lat double precision default null, p_lon double precision default null,
  p_limit int default 8
)
returns jsonb
language sql stable
set search_path = public
as $$
  with m as (
    select d.*,
           case when p_lat is null or p_lon is null or d.lat is null or d.lon is null then null
                else round((3958.8 * 2 * asin(sqrt(
                       power(sin(radians(d.lat - p_lat) / 2), 2)
                       + cos(radians(p_lat)) * cos(radians(d.lat)) * power(sin(radians(d.lon - p_lon) / 2), 2))))::numeric)
           end as distance_mi
    from degree_programs d
    where p_soc = any(d.socs) and d.onet_level between p_min_level and p_max_level
  ),
  near as (
    select * from m
    order by (p_state is not null and state = p_state) desc, distance_mi nulls last, graduates desc nulls last
    limit p_limit
  ),
  web as (
    select * from m where online = 'full' and id not in (select id from near)
    order by graduates desc nulls last limit 5
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'nationwide',      (select count(*) from m),
      'in_state',        (select count(*) from m where state = p_state),
      'online',          (select count(*) from m where online = 'full'),
      'median_earn_1yr', (select percentile_cont(0.5) within group (order by earn_1yr) from m where earn_1yr is not null),
      'median_debt',     (select percentile_cont(0.5) within group (order by debt_median) from m where debt_median is not null),
      'data_year',       (select max(data_year) from m)
    ),
    'programs', coalesce((select jsonb_agg(to_jsonb(n) - 'socs' order by (p_state is not null and n.state = p_state) desc, n.distance_mi nulls last, n.graduates desc nulls last) from near n), '[]'::jsonb),
    'online_programs', coalesce((select jsonb_agg(to_jsonb(w) - 'socs' order by w.graduates desc nulls last) from web w), '[]'::jsonb)
  );
$$;
grant execute on function public.degree_options(text, int, int, text, double precision, double precision, int) to anon, authenticated;

-- ── career_links: + typical education of the current and the target job ────
create or replace function public.career_links(p_soc text, p_state text default null, p_include_lower boolean default false)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by k, r desc), '[]'::jsonb)
  from (
    select case l.kind when 'advancement' then 1 when 'career_change' then 2 else 3 end as k,
           l.pay_ratio as r,
           jsonb_build_object(
             'soc', l.target_soc, 'title', o.title, 'kind', l.kind, 'basis', l.basis,
             'pay_ratio', l.pay_ratio, 'median_national', l.median_to,
             'median_state', ms.p50,
             -- Pay used for the move's value: the state median; when BLS has no state
             -- figure loaded for this job, the national median × the state's
             -- all-occupations level (state median ÷ national median).
             'median_local', round(coalesce(ms.p50, l.median_to * coalesce(lvl.f, 1))),
             'median_local_basis', case when ms.p50 is not null then 'state'
                                        when lvl.f is not null then 'estimated' else 'national' end,
             'entry_pay', entry_pay(l.target_soc, p_state),
             'job_zone_from', l.job_zone_from, 'job_zone_to', l.job_zone_to,
             'edu_from', ef.typical_level, 'edu_to', et.typical_level, 'edu_to_share', et.typical_share,
             'skill_gaps', l.skill_gaps,
             'credentials', occupation_credentials_for(l.target_soc, p_state),
             'related_tier', l.related_tier, 'wage_period', l.wage_period, 'onet_version', l.onet_version
           ) as x
    from occupation_links l
    join occupations o on o.soc = l.target_soc
    left join occupation_education ef on ef.soc = l.soc
    left join occupation_education et on et.soc = l.target_soc
    left join lateral (select w.p50 from latest_wage_benchmarks w
                        where w.soc = l.target_soc and w.area_type = 'state' and w.area_code = p_state) ms on true
    left join lateral (select s.p50 / nullif(n.p50, 0) as f from latest_wage_benchmarks s
                         join latest_wage_benchmarks n on n.soc = s.soc and n.area_type = 'national'
                        where p_state is not null and s.soc = '00-0000' and s.area_type = 'state' and s.area_code = p_state) lvl on true
    where l.soc = p_soc and (p_include_lower or l.kind <> 'lower_pay')
  ) t;
$$;
grant execute on function public.career_links(text, text, boolean) to anon, authenticated;
