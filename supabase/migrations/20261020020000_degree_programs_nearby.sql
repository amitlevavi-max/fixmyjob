-- ─────────────────────────────────────────────────────────────────────────────
-- College programs for a move: ONE list (decision Amit, 2026-10-20)
--
-- Replaces degree_options() from 20261020010000_degree_programs.sql, which
-- returned "nearby" and "fully online" as two lists that overlapped.
-- Now: every program that is fully online OR within a radius of the user,
-- sorted by the yearly tuition the user would pay (cheapest first).
--
--   Centre and radius
--     - the app passes a map point (ZIP, else metro centre) → 100 miles
--     - no point but a state → the middle of the state → 200 miles
--       (middle = centre of the box around the state's schools in
--       degree_programs, so no separate coordinates table)
--     - neither → fully-online programs only
--   Tuition shown: in-state rate when the school is in the user's state,
--   else out-of-state (in-state when no out-of-state rate is reported).
--
-- Revert: re-run the degree_options block of 20261020010000_degree_programs.sql
-- and drop this function's 8-argument version.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.degree_options(text, int, int, text, double precision, double precision, int);

create or replace function public.degree_options(
  p_soc text, p_min_level int, p_max_level int,
  p_state text default null, p_lat double precision default null, p_lon double precision default null,
  p_radius_mi int default null, p_limit int default 200
)
returns jsonb
language sql stable
set search_path = public
as $$
  with centre as (
    select case when p_lat is not null and p_lon is not null then p_lat
                else (select (min(lat) + max(lat)) / 2 from degree_programs where state = p_state and lat is not null) end as lat,
           case when p_lat is not null and p_lon is not null then p_lon
                else (select (min(lon) + max(lon)) / 2 from degree_programs where state = p_state and lon is not null) end as lon,
           case when p_lat is not null and p_lon is not null then 'point'
                when p_state is not null then 'state' else 'none' end as basis
  ),
  r as (
    select c.*, case c.basis when 'point' then coalesce(p_radius_mi, 100)
                             when 'state' then coalesce(p_radius_mi, 200) end as radius
    from centre c
  ),
  m as (
    select d.*,
           case when r.lat is null or r.lon is null or d.lat is null or d.lon is null then null
                else round((3958.8 * 2 * asin(sqrt(
                       power(sin(radians(d.lat - r.lat) / 2), 2)
                       + cos(radians(r.lat)) * cos(radians(d.lat)) * power(sin(radians(d.lon - r.lon) / 2), 2))))::numeric)
           end as distance_mi,
           case when p_state is not null and d.state = p_state then d.tuition_in
                else coalesce(d.tuition_out, d.tuition_in) end as tuition,
           case when d.tuition_in is null and d.tuition_out is null then null
                when p_state is not null and d.state = p_state then 'in_state'
                when d.tuition_out is null then 'in_state'
                else 'out_of_state' end as tuition_basis
    from degree_programs d, r
    where p_soc = any(d.socs) and d.onet_level between p_min_level and p_max_level
  ),
  hit as (
    select m.* from m, r
    where m.online = 'full' or (r.radius is not null and m.distance_mi <= r.radius)
  ),
  top as (
    select * from hit order by tuition asc nulls last, graduates desc nulls last limit p_limit
  )
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total',           (select count(*) from hit),
      'nearby',          (select count(*) from hit, r where r.radius is not null and hit.distance_mi <= r.radius),
      'online',          (select count(*) from hit where online = 'full'),
      'nationwide',      (select count(*) from m),
      'radius_mi',       (select radius from r),
      'centre',          (select basis from r),
      'median_earn_1yr', (select percentile_cont(0.5) within group (order by earn_1yr) from hit where earn_1yr is not null),
      'data_year',       (select max(data_year) from m)
    ),
    'programs', coalesce((select jsonb_agg(to_jsonb(t) - 'socs' - 'debt_median' - 'debt_monthly'
                                           order by t.tuition asc nulls last, t.graduates desc nulls last) from top t), '[]'::jsonb)
  );
$$;
grant execute on function public.degree_options(text, int, int, text, double precision, double precision, int, int) to anon, authenticated;
