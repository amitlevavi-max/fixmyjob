-- ─────────────────────────────────────────────────────────────────────────────
-- Where does my job pay more?  Metro wages + cost of living.
--
--   wage_areas       every OEWS state and metro / non-metro area (BLS oe.area)
--   price_parities   cost of living by state and metro (BEA Regional Price
--                    Parities, all items; US = 100)
--   wage_benchmarks  + employment (jobs in that area for that occupation)
--   wage_map(soc)    national + state + metro wages for one occupation, with
--                    cost of living, for the relocation explorer
--
-- Filled by the refresh-benchmarks Edge Function ({"job":"areas"} monthly;
-- metro wages hourly for tracked occupations and on demand from the app).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.wage_areas (
  area_type     text not null check (area_type in ('state', 'metro')),
  area_code     text not null,          -- state: FIPS '36'; metro: OEWS 7-digit code '0035620'
  name          text not null,          -- 'New York-Newark-Jersey City, NY-NJ'
  short_name    text not null,          -- 'New York'
  state_abbrs   text[] not null default '{}',   -- {'NY','NJ'}
  cbsa          text,                   -- '35620' (metros only; joins BEA data)
  is_nonmetro   boolean not null default false,
  updated_at    timestamptz not null default now(),
  primary key (area_type, area_code)
);

create table if not exists public.price_parities (
  area_type   text not null check (area_type in ('state', 'metro')),
  area_code   text not null,            -- state FIPS '36' / CBSA '35620'
  year        text not null,
  rpp         numeric not null,         -- 100 = US average prices
  updated_at  timestamptz not null default now(),
  primary key (area_type, area_code)
);

alter table public.wage_benchmarks add column if not exists employment numeric;

-- Re-create the view so it includes the new column (it was defined with *)
create or replace view public.latest_wage_benchmarks as
  select distinct on (soc, area_type, area_code) *
  from public.wage_benchmarks
  order by soc, area_type, area_code, period desc;

alter table public.wage_areas     enable row level security;
alter table public.price_parities enable row level security;
drop policy if exists "read wage_areas" on public.wage_areas;
create policy "read wage_areas" on public.wage_areas for select using (true);
drop policy if exists "read price_parities" on public.price_parities;
create policy "read price_parities" on public.price_parities for select using (true);

-- ── One occupation, every place ─────────────────────────────────────────────
create or replace function public.wage_map(p_soc text)
returns table (
  area_type text, area_code text, name text, short_name text, state_abbrs text[],
  is_nonmetro boolean, p25 numeric, p50 numeric, p75 numeric, employment numeric,
  period text, rpp numeric, rpp_year text
)
language sql stable
set search_path = public
as $$
  with us as (
    select 'national'::text as area_type, 'US'::text as area_code, 'United States'::text as name,
           'United States'::text as short_name, '{}'::text[] as state_abbrs, false as is_nonmetro,
           w.p25, w.p50, w.p75, w.employment, w.period, 100::numeric as rpp, null::text as rpp_year
    from latest_wage_benchmarks w
    where w.soc = p_soc and w.area_type = 'national'
  ),
  places as (
    select a.area_type, a.area_code, a.name, a.short_name, a.state_abbrs, a.is_nonmetro,
           w.p25, w.p50, w.p75, w.employment, w.period,
           coalesce(rm.rpp, rs.rpp) as rpp, coalesce(rm.year, rs.year) as rpp_year
    from wage_areas a
    join latest_wage_benchmarks w
      on w.soc = p_soc and w.area_type = a.area_type and w.area_code = a.area_code
    -- metros use their own price level; states (and non-metro areas) the state's
    left join price_parities rm
      on a.area_type = 'metro' and rm.area_type = 'metro' and rm.area_code = a.cbsa
    left join wage_areas sa
      on sa.area_type = 'state' and sa.state_abbrs[1] = a.state_abbrs[1]
    left join price_parities rs
      on rs.area_type = 'state' and rs.area_code = sa.area_code
    where w.p50 is not null
  )
  select * from us
  union all
  select * from places;
$$;

grant execute on function public.wage_map(text) to anon, authenticated;

-- How many metro rows exist for an occupation (lets the app know whether to
-- ask for an on-demand fill)
create or replace function public.metro_wage_count(p_soc text)
returns integer
language sql stable
set search_path = public
as $$
  select count(*)::int from wage_benchmarks w
  where w.soc = p_soc and w.area_type = 'metro'
    and w.period = (select max(period) from wage_benchmarks where area_type = 'national' and soc = '00-0000');
$$;

grant execute on function public.metro_wage_count(text) to anon, authenticated;
