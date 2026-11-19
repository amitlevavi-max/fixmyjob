-- Acronym matches also need the course to be in the certification's occupation group (2026-11-18):
-- "MAC" (Medical Assistant Certification) matched machining course codes ("CNC CSC-MAC 122"). An acronym now counts
-- only when the course and the certification share a SOC major group (first two digits). Full-name matches are
-- specific enough and keep no such check. Certifications without SOC codes keep acronym matching as before.

drop function if exists public.cos_course_matches(text, text);

create or replace function public.cos_course_matches(p_name text, p_acronym text, p_socs text[] default null)
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
  groups as (select array(select distinct left(s, 2) from unnest(coalesce(p_socs, '{}')) s) as g)
  select t.id, 'cos_name'::text
  from training_programs t, named
  where lower(t.name || ' ' || coalesce(t.credential, '')) like '%' || named.p || '%'
  union
  select t.id, 'cos_acronym'::text
  from training_programs t, word, groups
  where lower(t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.lw || '\M')
    and (t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.w || '\M')
    and (cardinality(groups.g) = 0
         or exists (select 1 from unnest(t.socs) s where left(s, 2) = any(groups.g)))
$$;
revoke all on function public.cos_course_matches(text, text, text[]) from public, anon, authenticated;

-- Pass the certification's SOC codes from cos_promote() and cos_link_courses()
do $migration$
declare
  d text;
begin
  d := pg_get_functiondef('public.cos_promote(int)'::regprocedure);
  if position('r.acronym end, r.socs)' in d) = 0 then
    if position('case when r.acronym_unique then r.acronym end)' in d) = 0 then
      raise exception 'cos_promote(): call not found';
    end if;
    execute replace(d, 'case when r.acronym_unique then r.acronym end)', 'case when r.acronym_unique then r.acronym end, r.socs)');
  end if;

  d := pg_get_functiondef('public.cos_link_courses(int)'::regprocedure);
  if position('then r.acronym end, r.socs) m' in d) = 0 then
    if position('select k.id, k.name,' in d) = 0 or position('then r.acronym end) m' in d) = 0 then
      raise exception 'cos_link_courses(): text not found';
    end if;
    d := replace(d, 'select k.id, k.name,', 'select k.id, k.name, k.socs,');
    d := replace(d, 'then r.acronym end) m', 'then r.acronym end, r.socs) m');
    execute d;
  end if;
end
$migration$;
