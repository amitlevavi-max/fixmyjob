-- ─────────────────────────────────────────────────────────────────────────────
-- Benchmarks: official wage & union-premium data, refreshed automatically.
--
-- Tables
--   tracked_occupations   SOC codes we fetch wages for (edit to add more)
--   wage_benchmarks       BLS OEWS annual wage percentiles by occupation × area
--   union_premiums        BLS CPS union vs non-union median weekly earnings
--                         by occupation group
--   benchmark_refresh_log one row per refresh run (status, counts, errors)
--
-- Writes happen only from the `refresh-benchmarks` Edge Function (service
-- role bypasses RLS). The app reads with the anon key.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tracked_occupations (
  soc        text primary key,          -- e.g. '35-2014'
  title      text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.wage_benchmarks (
  id          bigserial primary key,
  source      text not null default 'bls_oews',
  soc         text not null,            -- '00-0000' = all occupations
  area_type   text not null check (area_type in ('national', 'state', 'metro')),
  area_code   text not null,            -- 'US', state FIPS ('42'), or CBSA ('37980')
  area_label  text,
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric,
  mean        numeric,
  period      text not null,            -- OEWS reference year, e.g. '2024' (= May 2024)
  fetched_at  timestamptz not null default now(),
  unique (source, soc, area_type, area_code, period)
);
create index if not exists wage_benchmarks_lookup
  on public.wage_benchmarks (soc, area_type, area_code, period desc);

create table if not exists public.union_premiums (
  id               bigserial primary key,
  occupation_group text not null,       -- slug, e.g. 'food_prep'
  occupation_label text not null,       -- as printed by BLS
  soc_majors       text[] not null,     -- SOC major groups covered, e.g. '{35}'
  union_weekly     numeric not null,    -- median weekly earnings, union members
  nonunion_weekly  numeric not null,    -- median weekly earnings, non-union
  premium_pct      numeric generated always as
                     (round(((union_weekly / nullif(nonunion_weekly, 0)) - 1) * 100, 1)) stored,
  period           text not null,       -- data year, e.g. '2025'
  released_at      date,
  source_url       text,
  note             text,
  fetched_at       timestamptz not null default now(),
  unique (occupation_group, period)
);

create table if not exists public.benchmark_refresh_log (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  job         text not null,            -- 'oews' | 'union'
  status      text not null,            -- 'ok' | 'no_change' | 'error'
  rows_upserted integer default 0,
  period      text,
  detail      text
);

-- Latest period per key — what the app reads
create or replace view public.latest_wage_benchmarks as
  select distinct on (soc, area_type, area_code) *
  from public.wage_benchmarks
  order by soc, area_type, area_code, period desc;

create or replace view public.latest_union_premiums as
  select distinct on (occupation_group) *
  from public.union_premiums
  order by occupation_group, period desc;

-- ── Row-level security: public read, no client writes ───────────────────────
alter table public.tracked_occupations   enable row level security;
alter table public.wage_benchmarks       enable row level security;
alter table public.union_premiums        enable row level security;
alter table public.benchmark_refresh_log enable row level security;

drop policy if exists "read tracked_occupations" on public.tracked_occupations;
create policy "read tracked_occupations" on public.tracked_occupations for select using (true);
drop policy if exists "read wage_benchmarks" on public.wage_benchmarks;
create policy "read wage_benchmarks" on public.wage_benchmarks for select using (true);
drop policy if exists "read union_premiums" on public.union_premiums;
create policy "read union_premiums" on public.union_premiums for select using (true);
-- refresh log: no public policy (service role only)

-- Views run with the querying user's rights (so RLS above applies)
alter view public.latest_wage_benchmarks set (security_invoker = on);
alter view public.latest_union_premiums  set (security_invoker = on);

-- ── Seed: occupations the app knows about (mirrors src/data/blsOews.ts) ─────
insert into public.tracked_occupations (soc, title) values
  ('00-0000', 'All Occupations'),
  ('35-2014', 'Cooks, Restaurant'),
  ('35-2021', 'Food Preparation Workers'),
  ('35-3031', 'Waiters and Waitresses'),
  ('35-3011', 'Bartenders'),
  ('35-9031', 'Hosts and Hostesses'),
  ('41-2031', 'Retail Salespersons'),
  ('41-2011', 'Cashiers'),
  ('41-2021', 'Counter and Rental Clerks'),
  ('53-3032', 'Heavy and Tractor-Trailer Truck Drivers'),
  ('53-3033', 'Light Truck Drivers'),
  ('53-3031', 'Driver/Sales Workers and Delivery Drivers'),
  ('53-3051', 'Bus Drivers, School or Special Client'),
  ('53-3041', 'Taxi Drivers and Chauffeurs'),
  ('53-7065', 'Stockers and Order Fillers'),
  ('53-7051', 'Industrial Truck and Tractor Operators'),
  ('51-9111', 'Packaging and Filling Machine Operators'),
  ('47-2061', 'Construction Laborers'),
  ('47-2111', 'Electricians'),
  ('47-2152', 'Plumbers, Pipefitters, and Steamfitters'),
  ('47-2031', 'Carpenters'),
  ('47-2181', 'Roofers'),
  ('47-2141', 'Painters, Construction and Maintenance'),
  ('49-9021', 'Heating, Air Conditioning, and Refrigeration Mechanics'),
  ('49-3023', 'Automotive Service Technicians and Mechanics'),
  ('51-4041', 'Machinists'),
  ('51-4121', 'Welders, Cutters, Solderers, and Brazers'),
  ('51-2098', 'Assemblers and Fabricators'),
  ('49-9041', 'Industrial Machinery Mechanics'),
  ('37-2011', 'Janitors and Cleaners'),
  ('37-2012', 'Maids and Housekeeping Cleaners'),
  ('37-3011', 'Landscaping and Groundskeeping Workers'),
  ('31-1121', 'Home Health and Personal Care Aides'),
  ('31-1131', 'Nursing Assistants'),
  ('31-9092', 'Medical Assistants'),
  ('29-2061', 'Licensed Practical and Licensed Vocational Nurses'),
  ('29-2052', 'Pharmacy Technicians'),
  ('33-9032', 'Security Guards'),
  ('43-4051', 'Customer Service Representatives'),
  ('43-9061', 'Office Clerks, General'),
  ('43-4171', 'Receptionists and Information Clerks'),
  ('43-5052', 'Postal Service Mail Carriers'),
  ('39-5012', 'Hairdressers, Hairstylists, and Cosmetologists'),
  ('39-9011', 'Childcare Workers')
on conflict (soc) do nothing;

-- ── Seed: BLS "Union Members — 2025" (USDL-26-0229, released 2026-02-18),
--    Table 4, median weekly earnings of full-time wage & salary workers.
--    2025 figures are 11-month averages (October excluded — federal shutdown).
--    The refresh function replaces these when BLS publishes a newer year.
insert into public.union_premiums
  (occupation_group, occupation_label, soc_majors, union_weekly, nonunion_weekly, period, released_at, source_url, note)
values
  ('total',              'Total, 16 years and over',                 '{00}', 1404, 1174, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('service',            'Service occupations',                      '{31,33,35,37,39}', 1158, 762, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('healthcare_support', 'Healthcare support occupations',           '{31}', 884, 777, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('protective',         'Protective service occupations',           '{33}', 1728, 1011, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('food_prep',          'Food preparation and serving related',     '{35}', 757, 699, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('building_cleaning',  'Building and grounds cleaning and maintenance', '{37}', 924, 744, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('personal_care',      'Personal care and service occupations',    '{39}', 907, 750, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('sales',              'Sales and related occupations',            '{41}', 1043, 1116, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('office',             'Office and administrative support',        '{43}', 1145, 963, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('construction',       'Construction and extraction occupations',  '{47}', 1561, 1004, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('installation',       'Installation, maintenance, and repair',    '{49}', 1571, 1140, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('production',         'Production occupations',                   '{51}', 1161, 945, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)'),
  ('transportation',     'Transportation and material moving',       '{53}', 1174, 866, '2025', '2026-02-18', 'https://www.bls.gov/news.release/union2.t04.htm', '11-month average (Oct excluded)')
on conflict (occupation_group, period) do nothing;
