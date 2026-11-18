-- ─────────────────────────────────────────────────────────────────────────────
-- Health insurance through a job (Amit, 2026-11-06 — plan doc "fixmyjob –
-- Employer Health Insurance Data Plan (ACS)").
--
-- 1. acs_health_insurance — share of employees with health insurance through a
--    current or former employer or union (ACS variable HINS1), from the Census
--    Bureau's American Community Survey 5-year microdata (PUMS). Our own
--    estimates ("Fix My Job estimate"), filled by scripts/import-acs-insurance.mjs.
--    Levels, most to least specific (the app uses the first reliable one):
--      state_occ_band  state × Census occupation × wage band (1–4)
--      state_occ       state × Census occupation
--      us_occ          whole US × Census occupation (state = 'US')
--      state_group     state × SOC major group (occ = '29', '53' …)
--    Only employees (class of worker 1–5), aged 18–64, with a job.
--    reliable = at least 100 people answered and the 90% margin of error is
--    at most ±10 points (thresholds in the import script).
--
-- 2. acs_health_insurance_bands — per state, the hourly pay at the 25th, 50th
--    and 75th percentile of those employees: wage band 1 = below the first,
--    4 = at or above the last.
--
-- 3. meps_ic_premiums — what single / employee-plus-one / family coverage costs
--    in each state, split into what the employee pays and what the employer pays
--    (AHRQ Medical Expenditure Panel Survey – Insurance Component, private
--    sector, series 10 tables X.C–X.E). Filled by scripts/import-meps-premiums.mjs.
--
-- 4. user_profiles.health_coverage — the user's own answer, asked only inside
--    the "Ask for health insurance" action and in Profile (never in onboarding):
--    { "has": "yes"|"no"|"unsure", "monthly": number|null,
--      "covers": "single"|"plus_one"|"family"|null, "answeredAt": ISO }
--
-- All three data tables are public read-only; only the service role writes.
-- Revert: drop function public.health_insurance_share(text, text, numeric);
--         drop table public.acs_health_insurance, public.acs_health_insurance_bands, public.meps_ic_premiums;
--         alter table public.user_profiles drop column health_coverage;
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.acs_health_insurance (
  acs_period  text     not null,                 -- '2020-2024'
  level       text     not null check (level in ('state_occ_band', 'state_occ', 'us_occ', 'state_group')),
  state       text     not null,                 -- 'OH', or 'US' for us_occ
  occ         text     not null,                 -- Census occupation code ('3255'), or SOC major group ('29')
  wage_band   smallint not null default 0,       -- 1–4 for state_occ_band, else 0
  pct         numeric  not null,                 -- 0–1: share with job-based health insurance
  moe         numeric  not null,                 -- 0–1: 90% margin of error (replicate weights)
  n           integer  not null,                 -- people who answered (unweighted)
  reliable    boolean  not null,
  updated_at  timestamptz not null default now(),
  primary key (acs_period, level, state, occ, wage_band)
);
alter table public.acs_health_insurance enable row level security;
drop policy if exists "read acs_health_insurance" on public.acs_health_insurance;
create policy "read acs_health_insurance" on public.acs_health_insurance for select using (true);

create table if not exists public.acs_health_insurance_bands (
  acs_period  text      not null,
  state       text      not null,
  edges       numeric[] not null,                -- hourly pay: {p25, p50, p75}
  updated_at  timestamptz not null default now(),
  primary key (acs_period, state)
);
alter table public.acs_health_insurance_bands enable row level security;
drop policy if exists "read acs_health_insurance_bands" on public.acs_health_insurance_bands;
create policy "read acs_health_insurance_bands" on public.acs_health_insurance_bands for select using (true);

create table if not exists public.meps_ic_premiums (
  year         integer not null,                 -- survey year, e.g. 2025
  state        text    not null,                 -- 'OH', or 'US'
  coverage     text    not null check (coverage in ('single', 'plus_one', 'family')),
  premium      numeric,                          -- average total yearly premium ($)
  employee     numeric,                          -- average yearly employee contribution ($)
  employer     numeric,                          -- average yearly employer cost ($)
  employee_p10 numeric, employee_p25 numeric, employee_p50 numeric, employee_p75 numeric, employee_p90 numeric,
  employer_reliable boolean not null default true,   -- false when AHRQ flags the employer average (*)
  updated_at   timestamptz not null default now(),
  primary key (year, state, coverage)
);
alter table public.meps_ic_premiums enable row level security;
drop policy if exists "read meps_ic_premiums" on public.meps_ic_premiums;
create policy "read meps_ic_premiums" on public.meps_ic_premiums for select using (true);

alter table public.user_profiles add column if not exists health_coverage jsonb;

-- ── The best reliable figure for one user ──────────────────────────────────
-- p_soc: the user's occupation (BLS SOC, '29-1141'); p_state: 'OH' (null = US
-- only); p_hourly: the user's stated pay per hour (null = no wage band).
-- Same SOC → Census occupation match as cert_pay_gap().
create or replace function public.health_insurance_share(p_soc text, p_state text default null, p_hourly numeric default null)
returns table (
  level text, state text, occ text, wage_band smallint, pct numeric, moe numeric, n integer,
  acs_period text, census_title text
)
language sql stable
set search_path = public
as $$
  with period as (
    select acs_period from acs_health_insurance order by updated_at desc limit 1
  ), occ as (
    select c.census_code, c.title from census_occupations c
    where c.soc = p_soc or p_soc like c.soc_like
    order by (c.soc = p_soc) desc, length(replace(c.soc_like, '_', '')) desc
    limit 1
  ), band as (
    select (1 + (select count(*) from unnest(b.edges) e where p_hourly >= e))::smallint as b
    from acs_health_insurance_bands b, period p
    where b.acs_period = p.acs_period and b.state = p_state and p_hourly is not null and p_hourly > 0
  ), candidates as (
    select h.*, o.title as census_title, 1 as rnk
      from acs_health_insurance h join period p using (acs_period) join occ o on h.occ = o.census_code join band on h.wage_band = band.b
      where h.level = 'state_occ_band' and h.state = p_state
    union all
    select h.*, o.title, 2
      from acs_health_insurance h join period p using (acs_period) join occ o on h.occ = o.census_code
      where h.level = 'state_occ' and h.state = p_state
    union all
    select h.*, o.title, 3
      from acs_health_insurance h join period p using (acs_period) join occ o on h.occ = o.census_code
      where h.level = 'us_occ' and h.state = 'US'
    union all
    select h.*, null, 4
      from acs_health_insurance h join period p using (acs_period)
      where h.level = 'state_group' and h.state = p_state and h.occ = left(p_soc, 2)
  )
  select c.level, c.state, c.occ, c.wage_band, c.pct, c.moe, c.n, c.acs_period, c.census_title
  from candidates c
  where c.reliable
  order by c.rnk
  limit 1;
$$;
grant execute on function public.health_insurance_share(text, text, numeric) to anon, authenticated;
