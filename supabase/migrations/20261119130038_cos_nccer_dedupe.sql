-- Two fixes after the first catalog run (2026-11-19):
-- 1. NCCER credentials ("HVAC Technician", "Basic Rigger", "Heavy Equipment Operator: Dozer") are earned through
--    NCCER-accredited training: such a credential links only to courses that mention NCCER (name, credential or
--    description). Before, ordinary HVAC programs were linked to NCCER's "HVAC Technician".
-- 2. Two certifications with the same name from different issuers (e.g. "Certified Pharmacy Technician" from NHA and
--    from PTCB) link to the same courses, which don't say which one: flagged_certifications() now returns one per
--    name (in demand first, then the most courses near the user).

drop function if exists public.cos_course_matches(text, text, text[]);

create or replace function public.cos_course_matches(p_name text, p_acronym text, p_socs text[] default null,
                                                     p_require text default null)
returns table (course_id text, method text)
language sql stable
set search_path = public
as $$
  with phrase as (
    select lower(trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_name, ''),
             '[®™]', '', 'g'),
             '\(([^)a-z]*)\)', ' ', 'g'),                              -- acronym-only brackets
             '\s+(certification|certificate)\s*$', '', 'i'),
             '\s+', ' ', 'g'))) as p
  ),
  named as (                                                          -- full name, when specific
    select p from phrase
    where p ~ ' ' and length(p) >= 8
      and (p ~ '^(certified|registered|nationally|national|board) '
           or (not exists (select 1 from occupation_titles ot where ot.title_lc in (p, p || 's'))
               and not exists (select 1 from occupations o where lower(o.title) in (p, p || 's'))))
  ),
  word as (                                                           -- acronym (as written), or a one-word name like "CPR"
    select w, lower(w) as lw from (
      select nullif(regexp_replace(coalesce(p_acronym, ''), '[^A-Za-z0-9]', '', 'g'), '') as w
      union all
      select upper(p) from phrase where p !~ ' ' and length(p) >= 3
    ) x where length(w) >= 3
  ),
  groups as (select array(select distinct left(s, 2) from unnest(coalesce(p_socs, '{}')) s) as g),
  hits as (
    select t.id, 'cos_name'::text as method
    from training_programs t, named
    where lower(t.name || ' ' || coalesce(t.credential, '')) like '%' || named.p || '%'
    union
    select t.id, 'cos_acronym'::text
    from training_programs t, word, groups
    where lower(t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.lw || '\M')
      and (t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.w || '\M')
      and (cardinality(groups.g) = 0
           or exists (select 1 from unnest(t.socs) s where left(s, 2) = any(groups.g)))
  )
  select h.id, h.method
  from hits h
  where p_require is null
     or exists (select 1 from training_programs t where t.id = h.id
                  and (t.name || ' ' || coalesce(t.credential, '') || ' ' || coalesce(t.description, '')) ilike '%' || p_require || '%')
$$;
revoke all on function public.cos_course_matches(text, text, text[], text) from public, anon, authenticated;

-- Pass the NCCER requirement from cos_promote() and cos_link_courses()
do $migration$
declare
  d text;
begin
  d := pg_get_functiondef('public.cos_promote(int)'::regprocedure);
  if position('construction education and research'' then ''nccer''' in d) = 0 then
    if (length(d) - length(replace(d, 'r.acronym end, r.socs)', ''))) / length('r.acronym end, r.socs)') <> 2 then
      raise exception 'cos_promote(): expected 2 calls';
    end if;
    execute replace(d, 'r.acronym end, r.socs)',
      'r.acronym end, r.socs, case when r.org ~* ''construction education and research'' then ''nccer'' end)');
  end if;

  d := pg_get_functiondef('public.cos_link_courses(int)'::regprocedure);
  if position('construction education and research'' then ''nccer''' in d) = 0 then
    if position('select k.id, k.name, k.socs,' in d) = 0 or position('then r.acronym end, r.socs) m' in d) = 0 then
      raise exception 'cos_link_courses(): text not found';
    end if;
    d := replace(d, 'select k.id, k.name, k.socs,', 'select k.id, k.name, k.socs, k.issuer,');
    d := replace(d, 'then r.acronym end, r.socs) m',
      'then r.acronym end, r.socs, case when r.issuer ~* ''construction education and research'' then ''nccer'' end) m');
    execute d;
  end if;
end
$migration$;

-- Re-check NCCER certifications with the new rule (next cos_promote / cos_link_courses call)
update cos_catalog set promote_checked_at = null where org ~* 'construction education and research';
update credentials set cos_links_at = null where source <> 'careeronestop' and issuer ~* 'construction education and research';

-- One certification per name for the app
create or replace function public.flagged_certifications(
  p_soc text, p_state text default null, p_lat double precision default null, p_lon double precision default null,
  p_max_miles int default 50, p_held text[] default '{}', p_limit int default 3
)
returns jsonb
language sql stable
set search_path = public
as $$
  with cert as (
    select k.* from credentials k
    where (k.cos_in_demand or k.cos_industry_endorsed)
      and p_soc = any(k.socs)
      and k.kind in ('certification', 'badge')
      and coalesce(k.status, 'Active') !~* '(suspended|ceas|teach out|deprecated)'
      and not (lower(k.name) = any (select lower(h) from unnest(coalesce(p_held, '{}')) h))
  ),
  opts as (
    select k.id as cred_id, t.*,
           t.hours_per_week * greatest(t.weeks, 1) as total_hours,
           case when p_lat is not null and t.lat is not null
                then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi
    from cert k
    join course_credentials cc on cc.credential_id = k.id
    join training_programs t on t.id = cc.course_id
    where t.tuition is not null
      and coalesce(t.hours_per_week * greatest(t.weeks, 1), 0) > 0
      and (k.issuer ~* '(red cross|american heart association)'
           or exists (select 1 from unnest(t.socs) s where left(s, 2) = left(p_soc, 2)))
  ),
  near as (
    select * from opts
    where format = 'online'
       or (distance_mi is not null and distance_mi <= p_max_miles)
       or (distance_mi is null and p_state is not null and state = p_state)
  ),
  best as (
    select distinct on (cred_id) *, count(*) over (partition by cred_id) as courses_near
    from near
    order by cred_id,
             (completion_rate is not null or median_q2_earnings is not null) desc,   -- past-student results first
             (state = p_state) desc,
             coalesce(tuition, 0) + coalesce(supplies, 0) asc,
             total_hours asc
  ),
  one_per_name as (                                    -- same name from two issuers → the one users are likelier to need
    select distinct on (lower(k.name)) b.*, k.id as k_id
    from best b join cert k on k.id = b.cred_id
    order by lower(k.name), coalesce(k.cos_in_demand, false) desc, b.courses_near desc, k.id
  )
  select coalesce(jsonb_agg(item order by (item->'credential'->>'in_demand')::boolean desc,
                                          (item->'credential'->>'industry_endorsed')::boolean desc,
                                          (item->'course'->>'total_hours')::numeric asc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'credential', jsonb_build_object(
        'id', k.id, 'name', k.name, 'issuer', k.issuer, 'url', k.url, 'source', k.source,
        'cos_cert_id', k.cos_cert_id, 'in_demand', coalesce(k.cos_in_demand, false),
        'industry_endorsed', coalesce(k.cos_industry_endorsed, false), 'cos_checked_at', k.cos_flags_updated_at),
      'course', (to_jsonb(b) - 'cred_id' - 'k_id' - 'imported_at' - 'provider_id' - 'reporting_state' - 'courses_near')
                || jsonb_build_object('for_soc', p_soc,
                     'leads_to', jsonb_build_array(jsonb_build_object('name', k.name, 'issuer', k.issuer, 'kind', k.kind,
                       'finder_url', k.ce_finder_url, 'in_demand', coalesce(k.cos_in_demand, false),
                       'industry_endorsed', coalesce(k.cos_industry_endorsed, false), 'cos_checked_at', k.cos_flags_updated_at))),
      'courses_near', b.courses_near
    ) as item
    from one_per_name b join cert k on k.id = b.k_id
    order by coalesce(k.cos_in_demand, false) desc, coalesce(k.cos_industry_endorsed, false) desc, b.total_hours asc
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  ) x
$$;
grant execute on function public.flagged_certifications(text, text, double precision, double precision, int, text[], int)
  to anon, authenticated;
