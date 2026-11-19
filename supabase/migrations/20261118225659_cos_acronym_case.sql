-- Acronym matches must have the same capitals (2026-11-18): "MAC" (Medical Assistant Certification) must not match
-- "Apple Mac Basics". The lower-case test stays so the text index is used; the exact-case test filters.
create or replace function public.cos_course_matches(p_name text, p_acronym text)
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
  )
  select t.id, 'cos_name'::text
  from training_programs t, named
  where lower(t.name || ' ' || coalesce(t.credential, '')) like '%' || named.p || '%'
  union
  select t.id, 'cos_acronym'::text
  from training_programs t, word
  where lower(t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.lw || '\M')
    and (t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.w || '\M')
$$;
revoke all on function public.cos_course_matches(text, text) from public, anon, authenticated;
