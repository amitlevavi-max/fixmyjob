-- CareerOneStop catalog of flagged certifications, course links, "Get certified" data for the app (Amit, 2026-11-18).
--
-- Rule (claude/decisions.md): a certification is only useful when we can say how to get it (a real course with
-- cost and length) and what it brings. So:
--   * cos_catalog          — certifications CareerOneStop tags In-Demand or Industry-Endorsed, with the occupations
--                            (6-digit SOC) it lists them under. Filled by refresh-cos-flags (phase "discover").
--   * cos_course_matches() — courses (DOL + Credential Engine) that name a certification: its full name when that
--                            name is specific (two+ words and not itself a job title — "Medical Assistant" is a job,
--                            "Certified Clinical Medical Assistant" is a certification), or its acronym as a whole word
--                            when no other flagged certification uses the same acronym.
--   * cos_promote()        — a catalog certification that has no credential record yet gets one (source
--                            'careeronestop', id 'cos-<cert id>') ONLY when courses name it; links are stored in
--                            course_credentials (match_method cos_name / cos_acronym). No courses → no record.
--   * cos_link_courses()   — same links for flagged credentials that came from Credential Engine.
--   * flagged_certifications() — for the app: flagged certifications for a job, each with its best course
--                            (cost and length known; online, or within p_max_miles). Courses must belong to the same
--                            occupation group as the job (first two SOC digits) — CareerOneStop's occupation lists are
--                            noisy (e.g. Advanced EMT under welders) — except general safety certifications
--                            (American Red Cross, American Heart Association: CPR, First Aid, BLS).
--   * short_courses()      — among equally good Quick-win courses, one that leads to a flagged certification first.
--   * Monthly run: pg_cron job cos-flag-monthly (3rd of the month, 06:23 UTC) = start_cos_flag_refresh().
--
-- Revert:
--   select cron.unschedule('cos-flag-monthly');
--   delete from course_credentials where match_method in ('cos_name', 'cos_acronym');
--   delete from credentials where source = 'careeronestop';
--   drop function if exists public.flagged_certifications(text,text,double precision,double precision,int,text[],int),
--     public.cos_promote(int), public.cos_link_courses(int), public.cos_course_matches(text,text),
--     public.cos_catalog_upsert(jsonb), public.cos_catalog_begin(), public.cos_catalog_end(), public.cos_flag_phase(bigint,text,int,int,int,int);
--   drop table if exists public.cos_catalog;
--   alter table public.cos_flag_runs drop column if exists phase, drop column if exists soc_cursor,
--     drop column if exists discovered, drop column if exists promoted, drop column if exists linked;
--   alter table public.credentials drop column if exists cos_links_at;
--   drop index if exists training_programs_text_trgm;
--   (short_courses order: rerun 20261118203134_course_cos_flags.sql logic in reverse — remove the cos_flagged line)

-- ── Catalog ────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.cos_catalog (
  cert_id            text primary key,              -- CareerOneStop id, e.g. 3779-A
  name               text not null,
  acronym            text,
  org                text,                          -- certifying organization
  org_url            text,
  url                text,                          -- the organization's page about the certification
  description        text,
  cert_type          text,                          -- Core / Advanced / Specialty / Product/Equipment …
  tags               text[] not null default '{}',  -- In-Demand, IND, NCCA, ANAB, MILITARY …
  in_demand          boolean generated always as ('In-Demand' = any(tags)) stored,
  industry_endorsed  boolean generated always as ('IND' = any(tags)) stored,
  socs               text[] not null default '{}',  -- 6-digit SOC codes CareerOneStop lists it under
  socs_new           text[] not null default '{}',  -- being collected by the running discovery
  seen_at            timestamptz not null default now(),
  promote_checked_at timestamptz
);
alter table public.cos_catalog enable row level security;   -- no policies: service role / SQL editor only

alter table public.credentials add column if not exists cos_links_at timestamptz;  -- last time courses were linked by name/acronym

alter table public.cos_flag_runs
  add column if not exists phase text not null default 'flags',   -- flags → discover → promote → link → done
  add column if not exists soc_cursor int not null default 0,     -- discovery: next occupation (index in soc order)
  add column if not exists discovered int not null default 0,
  add column if not exists promoted int not null default 0,
  add column if not exists linked int not null default 0;

-- Course text search (name + "You get" credential)
create index if not exists training_programs_text_trgm
  on public.training_programs using gin ((lower(name || ' ' || coalesce(credential, ''))) gin_trgm_ops);

-- ── Matching courses to a certification ────────────────────────────────────────────────────────────────────────
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
  word as (                                                           -- acronym, or a one-word name like "CPR"
    select lower(w) as w from (
      select nullif(regexp_replace(coalesce(p_acronym, ''), '[^A-Za-z0-9]', '', 'g'), '') as w
      union all
      select p from phrase where p !~ ' ' and length(p) >= 3
    ) x where length(w) >= 3
  )
  select t.id, 'cos_name'::text
  from training_programs t, named
  where lower(t.name || ' ' || coalesce(t.credential, '')) like '%' || named.p || '%'
  union
  select t.id, 'cos_acronym'::text
  from training_programs t, word
  where lower(t.name || ' ' || coalesce(t.credential, '')) ~ ('\m' || word.w || '\M')
$$;

-- ── Catalog upkeep (called by refresh-cos-flags) ───────────────────────────────────────────────────────────────
create or replace function public.cos_catalog_begin()
returns void language sql security definer set search_path = public as $$
  update cos_catalog set socs_new = '{}' where socs_new <> '{}'
$$;

-- p_rows: [{cert_id, name, acronym, org, org_url, url, description, cert_type, tags: [], soc}]
create or replace function public.cos_catalog_upsert(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into cos_catalog as g (cert_id, name, acronym, org, org_url, url, description, cert_type, tags, socs, socs_new, seen_at)
  select x->>'cert_id', x->>'name', nullif(x->>'acronym', ''), x->>'org', nullif(x->>'org_url', ''), nullif(x->>'url', ''),
         nullif(x->>'description', ''), x->>'cert_type',
         coalesce(array(select jsonb_array_elements_text(x->'tags')), '{}'),
         array[x->>'soc'], array[x->>'soc'], now()
  from (select distinct on (x->>'cert_id', x->>'soc') x from jsonb_array_elements(p_rows) x) r(x)
  on conflict (cert_id) do update set
    name = excluded.name, acronym = excluded.acronym, org = excluded.org, org_url = excluded.org_url, url = excluded.url,
    description = excluded.description, cert_type = excluded.cert_type, tags = excluded.tags,
    socs_new = array(select distinct s from unnest(g.socs_new || excluded.socs_new) s order by s),
    socs = case when g.socs @> excluded.socs then g.socs
                else array(select distinct s from unnest(g.socs || excluded.socs) s order by s) end,
    seen_at = now();
  get diagnostics n = row_count;
  return n;
end $$;

-- After a full discovery: occupations = what this run found (drops occupations CareerOneStop no longer lists)
create or replace function public.cos_catalog_end()
returns void language sql security definer set search_path = public as $$
  update cos_catalog set socs = socs_new where socs_new <> '{}' and socs is distinct from socs_new
$$;

-- ── Records + links for catalog certifications that have courses ───────────────────────────────────────────────
create or replace function public.cos_promote(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_id text; v_links int; v_checked int := 0; v_added int := 0; v_removed int := 0;
  v_courses_at timestamptz := (select max(imported_at) from training_programs);
begin
  -- A Credential Engine record now covers it → the CareerOneStop copy goes
  delete from credentials c
  where c.source = 'careeronestop'
    and exists (select 1 from credentials k where k.source <> 'careeronestop' and k.cos_cert_id = c.cos_cert_id);
  get diagnostics v_removed = row_count;

  for r in
    select g.*,
           (select count(*) from cos_catalog x
             where (x.in_demand or x.industry_endorsed) and upper(x.acronym) = upper(g.acronym)) = 1 as acronym_unique
    from cos_catalog g
    where (g.in_demand or g.industry_endorsed)
      and g.seen_at > now() - interval '60 days'
      and (g.promote_checked_at is null or g.promote_checked_at < g.seen_at or g.promote_checked_at < v_courses_at)
      and not exists (select 1 from credentials k where k.cos_cert_id = g.cert_id and k.source <> 'careeronestop')
    order by g.cert_id
    limit p_limit
  loop
    v_checked := v_checked + 1;
    v_id := 'cos-' || r.cert_id;
    select count(*) into v_links from cos_course_matches(r.name, case when r.acronym_unique then r.acronym end);
    if v_links > 0 then
      insert into credentials (id, name, alternate_names, kind, type_label, issuer, issuer_type, state, socs, socs_inferred,
                               description, status, url, source, imported_at,
                               cos_cert_id, cos_in_demand, cos_industry_endorsed, cos_tags, cos_match, cos_flags_updated_at, cos_links_at)
      values (v_id, r.name, r.acronym, 'certification', coalesce(r.cert_type, 'Certification'), r.org,
              case when r.org ~* '(administration|agency|department|federal|environmental protection)' then 'government' else 'industry' end,
              null, r.socs, 'careeronestop', r.description, 'Active', coalesce(r.url, r.org_url), 'careeronestop', now(),
              r.cert_id, r.in_demand, r.industry_endorsed, r.tags, 'exact', now(), now())
      on conflict (id) do update set
        name = excluded.name, alternate_names = excluded.alternate_names, type_label = excluded.type_label,
        issuer = excluded.issuer, socs = excluded.socs, description = excluded.description, url = excluded.url,
        cos_in_demand = excluded.cos_in_demand, cos_industry_endorsed = excluded.cos_industry_endorsed,
        cos_tags = excluded.cos_tags, cos_flags_updated_at = now(), cos_links_at = now(), imported_at = now();
      delete from course_credentials where credential_id = v_id and match_method in ('cos_name', 'cos_acronym');
      insert into course_credentials (course_id, credential_id, relation, match_method)
      select distinct on (m.course_id) m.course_id, v_id, 'prepares_for', m.method
      from cos_course_matches(r.name, case when r.acronym_unique then r.acronym end) m
      order by m.course_id, m.method desc                                  -- cos_name before cos_acronym
      on conflict (course_id, credential_id) do nothing;
      v_added := v_added + 1;
    else
      delete from credentials where id = v_id;                             -- no courses → no record
    end if;
    update cos_catalog set promote_checked_at = now() where cert_id = r.cert_id;
  end loop;

  return jsonb_build_object('checked', v_checked, 'with_courses', v_added, 'replaced_by_ce', v_removed,
    'remaining', (select count(*) from cos_catalog g
                  where (g.in_demand or g.industry_endorsed) and g.seen_at > now() - interval '60 days'
                    and (g.promote_checked_at is null or g.promote_checked_at < g.seen_at or g.promote_checked_at < v_courses_at)
                    and not exists (select 1 from credentials k where k.cos_cert_id = g.cert_id and k.source <> 'careeronestop')));
end $$;

-- ── Links for flagged credentials from Credential Engine ───────────────────────────────────────────────────────
create or replace function public.cos_link_courses(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record; v_checked int := 0; v_links int := 0; n int;
  v_courses_at timestamptz := (select max(imported_at) from training_programs);
begin
  -- Credentials that lost their flags: their name/acronym links go
  delete from course_credentials cc using credentials k
  where cc.credential_id = k.id and cc.match_method in ('cos_name', 'cos_acronym')
    and k.source <> 'careeronestop' and not (coalesce(k.cos_in_demand, false) or coalesce(k.cos_industry_endorsed, false));

  for r in
    select k.id, k.name,
           coalesce(nullif(k.alternate_names, ''), substring(k.name from '\(([^)a-z]*)\)')) as acronym
    from credentials k
    where k.source <> 'careeronestop' and (k.cos_in_demand or k.cos_industry_endorsed)
      and (k.cos_links_at is null or k.cos_links_at < v_courses_at or k.cos_links_at < k.cos_flags_updated_at)
    order by k.id
    limit p_limit
  loop
    v_checked := v_checked + 1;
    delete from course_credentials where credential_id = r.id and match_method in ('cos_name', 'cos_acronym');
    insert into course_credentials (course_id, credential_id, relation, match_method)
    select distinct on (m.course_id) m.course_id, r.id, 'prepares_for', m.method
    from cos_course_matches(r.name,
           case when (select count(*) from credentials x
                      where (x.cos_in_demand or x.cos_industry_endorsed)
                        and upper(regexp_replace(coalesce(nullif(x.alternate_names, ''), substring(x.name from '\(([^)a-z]*)\)'), ''), '[^A-Za-z0-9]', '', 'g'))
                          = upper(regexp_replace(coalesce(r.acronym, ''), '[^A-Za-z0-9]', '', 'g'))) = 1
                then r.acronym end) m
    order by m.course_id, m.method desc
    on conflict (course_id, credential_id) do nothing;
    get diagnostics n = row_count;
    v_links := v_links + n;
    update credentials set cos_links_at = now() where id = r.id;
  end loop;

  return jsonb_build_object('checked', v_checked, 'links', v_links,
    'remaining', (select count(*) from credentials k
                  where k.source <> 'careeronestop' and (k.cos_in_demand or k.cos_industry_endorsed)
                    and (k.cos_links_at is null or k.cos_links_at < v_courses_at or k.cos_links_at < k.cos_flags_updated_at)));
end $$;

-- ── Run phases ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.cos_flag_phase(p_run bigint, p_phase text, p_cursor int,
                                                 p_discovered int, p_promoted int, p_linked int)
returns void language sql security definer set search_path = public as $$
  update cos_flag_runs
  set phase = coalesce(p_phase, phase), soc_cursor = coalesce(p_cursor, soc_cursor),
      discovered = discovered + coalesce(p_discovered, 0), promoted = promoted + coalesce(p_promoted, 0),
      linked = linked + coalesce(p_linked, 0)
  where id = p_run
$$;

revoke all on function public.cos_course_matches(text, text), public.cos_catalog_begin(), public.cos_catalog_upsert(jsonb),
  public.cos_catalog_end(), public.cos_promote(int), public.cos_link_courses(int),
  public.cos_flag_phase(bigint, text, int, int, int, int)
  from public, anon, authenticated;
grant execute on function public.cos_catalog_begin(), public.cos_catalog_upsert(jsonb), public.cos_catalog_end(),
  public.cos_promote(int), public.cos_link_courses(int), public.cos_flag_phase(bigint, text, int, int, int, int)
  to service_role;

-- ── For the app: flagged certifications for a job, each with its best course ──────────────────────────────────
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
      'course', (to_jsonb(b) - 'cred_id' - 'imported_at' - 'provider_id' - 'reporting_state' - 'courses_near')
                || jsonb_build_object('for_soc', p_soc,
                     'leads_to', jsonb_build_array(jsonb_build_object('name', k.name, 'issuer', k.issuer, 'kind', k.kind,
                       'finder_url', k.ce_finder_url, 'in_demand', coalesce(k.cos_in_demand, false),
                       'industry_endorsed', coalesce(k.cos_industry_endorsed, false), 'cos_checked_at', k.cos_flags_updated_at))),
      'courses_near', b.courses_near
    ) as item
    from best b join cert k on k.id = b.cred_id
    order by coalesce(k.cos_in_demand, false) desc, coalesce(k.cos_industry_endorsed, false) desc, b.total_hours asc
    limit greatest(1, least(coalesce(p_limit, 3), 10))
  ) x
$$;
grant execute on function public.flagged_certifications(text, text, double precision, double precision, int, text[], int)
  to anon, authenticated;

-- ── Quick-win courses: one leading to a flagged certification first among equals ──────────────────────────────
do $migration$
declare
  sig constant regprocedure := 'public.short_courses(text[], text, text, double precision, double precision, int, text[], int)'::regprocedure;
  anchor constant text := $a$order by (format <> 'online') desc,
             (state = p_state) desc,$a$;
  added constant text := $b$order by (format <> 'online') desc,
             (state = p_state) desc,
             exists (select 1 from course_credentials cc join credentials cr on cr.id = cc.credential_id
                      where cc.course_id = best.id and (cr.cos_in_demand or cr.cos_industry_endorsed)) desc,  -- flagged certification first (Amit, 2026-11-18)$b$;
  def text := pg_get_functiondef(sig);
begin
  if position('flagged certification first' in def) > 0 then return; end if;
  if position(anchor in def) = 0 then
    raise exception 'short_courses(): order anchor not found — function changed since 20261112000000_credential_engine.sql';
  end if;
  execute replace(def, anchor, added);
end
$migration$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int, text[], int) to anon, authenticated;

-- ── Monthly run (3rd of the month, after the Credential Engine re-export on the 2nd) ──────────────────────────
select cron.schedule('cos-flag-monthly', '23 6 3 * *', $job$select public.start_cos_flag_refresh()$job$);
