-- ─────────────────────────────────────────────────────────────────────────────
-- Training near the user: ZIP → map point → nearest city, distances to
-- approved programs, and a 30-day cache of web searches for course providers.
--
--   zip_points          ZIP code areas (Census ZCTA) with their centre point
--   cbsa_points         metro/micro areas (Census CBSA) with their centre point
--                       (both from the Census Gazetteer files, loaded by
--                        scripts/import-geo.mjs)
--   locate_zip(zip)     the ZIP's point + the nearest metro area ("closest city")
--   training_options()  now sorts by distance when the user's point is known
--   course_search_cache one web search per course + area, reused for 30 days
--                       (written only by the find-courses Edge Function)
--   user_profiles       + home_zip / home_lat / home_lon / home_city
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.zip_points (
  zip   text primary key,
  lat   double precision not null,
  lon   double precision not null
);
create table if not exists public.cbsa_points (
  cbsa        text primary key,
  name        text not null,            -- 'Tyler, TX'
  city        text not null,            -- 'Tyler'
  state       text not null,            -- 'TX' (first state in the name)
  is_metro    boolean not null,         -- metropolitan (vs micropolitan)
  lat         double precision not null,
  lon         double precision not null
);
alter table public.zip_points  enable row level security;
alter table public.cbsa_points enable row level security;
drop policy if exists "read zip_points" on public.zip_points;
create policy "read zip_points" on public.zip_points for select using (true);
drop policy if exists "read cbsa_points" on public.cbsa_points;
create policy "read cbsa_points" on public.cbsa_points for select using (true);

alter table public.user_profiles add column if not exists home_zip  text;
alter table public.user_profiles add column if not exists home_lat  double precision;
alter table public.user_profiles add column if not exists home_lon  double precision;
alter table public.user_profiles add column if not exists home_city text;

-- Straight-line distance in miles
create or replace function public.miles(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision
language sql immutable
as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ZIP → point + closest metro area
create or replace function public.locate_zip(p_zip text)
returns table (zip text, lat double precision, lon double precision,
               cbsa text, city text, state text, city_miles double precision)
language sql stable
set search_path = public
as $$
  select z.zip, z.lat, z.lon, c.cbsa, c.city, c.state, round(miles(z.lat, z.lon, c.lat, c.lon)::numeric, 0)::double precision
  from zip_points z
  cross join lateral (
    select * from cbsa_points c where c.is_metro
    order by miles(z.lat, z.lon, c.lat, c.lon) limit 1
  ) c
  where z.zip = left(regexp_replace(p_zip, '\D', '', 'g'), 5);
$$;
grant execute on function public.locate_zip(text) to anon, authenticated;

-- ── Approved programs, nearest first when the user's point is known ────────
drop function if exists public.training_options(text, text, int);
create or replace function public.training_options(
  p_soc text, p_state text default null, p_limit int default 10,
  p_lat double precision default null, p_lon double precision default null,
  p_radius double precision default 100
)
returns jsonb
language sql stable
set search_path = public
as $$
  with matches as (
    select t.*,
           case when p_lat is not null and t.lat is not null
                then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 0) end as distance_mi
    from training_programs t where p_soc = any(t.socs)
  ), local as (
    select * from matches
    where case when p_lat is not null then distance_mi <= p_radius
               else (p_state is null or state = p_state) end
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'in_state',          (select count(*) from local),   -- in the area (radius or state)
      'nationwide',        (select count(*) from matches),
      'radius_mi',         case when p_lat is not null then p_radius end,
      'median_weeks',      (select percentile_cont(0.5) within group (order by weeks) from local where weeks > 0),
      'median_tuition',    (select percentile_cont(0.5) within group (order by tuition) from local where tuition > 0),
      'median_completion', (select percentile_cont(0.5) within group (order by completion_rate) from local where completion_rate is not null),
      'with_results',      (select count(*) from local where median_q2_earnings is not null),
      'reported_to',       (select max(reported_at) from local)
    ),
    'programs', coalesce((
      select jsonb_agg(to_jsonb(p) - 'imported_at' - 'provider_id' - 'reporting_state')
      from (
        select * from local
        order by (median_q2_earnings is not null) desc,
                 distance_mi asc nulls last,
                 (completion_rate is not null and coalesce(exited, 0) >= 10) desc,
                 completion_rate desc nulls last,
                 tuition asc nulls last
        limit greatest(1, least(p_limit, 50))
      ) p
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.training_options(text, text, int, double precision, double precision, double precision) to anon, authenticated;

-- ── Web search results for course providers, reused for 30 days ────────────
create table if not exists public.course_search_cache (
  key          text primary key,          -- normalised 'course|area'
  course       text not null,
  area_label   text not null,             -- 'Tyler, TX'
  results      jsonb not null,            -- [{name, provider, location, price, price_source, duration, url}]
  model        text,
  searched_at  timestamptz not null default now()
);
alter table public.course_search_cache enable row level security;   -- Edge Function only (service role)
