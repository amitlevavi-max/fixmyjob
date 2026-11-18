-- ─────────────────────────────────────────────────────────────────────────────
-- Credential Engine (Credential Registry / Credential Finder) — Amit, 2026-11-12
-- Plan: claude/credential-engine-plan.md. Loaded by scripts/import-credential-engine.mjs.
--
-- Two kinds of things, kept apart:
--   credential — something a person HOLDS: a state license, an industry certification
--                (new table credentials)
--   course     — something a person TAKES at a provider (existing table training_programs;
--                new column source = 'dol' | 'credential_engine')
-- and how they connect:
--   course_credentials      — course → credential it prepares for (matched by name + shared occupation)
--   occupation_credentials  — new column credential_id: links the curated mandatory/optional list
--                             to a credential record (filled by hand later; nothing automatic)
--
-- Functions changed so Credential Engine rows don't change existing figures or claims:
--   cip_soc_shares()   — DOL programs only (feeds graduates' pay in refresh-entry-pay)
--   training_options() — DOL programs only (that screen says "approved for federal job-training funds")
--   short_courses()    — Quick-win courses: DOL and Credential Engine. Credential Engine courses may give
--                        hours but no weeks; each course also returns the credentials it prepares for (leads_to)
-- New functions:
--   set_ce_matches(jsonb)        — marks DOL programs that Credential Engine also lists (service role only)
--   match_credential_socs(int)   — gives licenses without an occupation code one, from the license name
--                                  and the O*NET / BLS job titles, when the match is close (service role only)
--   credentials_for(soc, state)  — credentials for an occupation (app)
--
-- Revert:
--   drop function public.credentials_for(text, text); drop function public.match_credential_socs(int);
--   drop function public.set_ce_matches(jsonb); drop table public.data_source_settings;
--   alter table public.occupation_credentials drop column credential_id;
--   drop table public.course_credentials; drop table public.credentials;
--   delete from public.training_programs where source = 'credential_engine';
--   alter table public.training_programs drop column source, drop column ce_ctid, drop column ce_finder_url,
--     drop column ce_updated_at, drop column socs_inferred;
--   re-run cip_soc_shares from 20261019000000_career_paths.sql, training_options from
--   20261008010000_course_search_geo.sql and short_courses from 20261027020000_course_supervisor_match.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── On/off switch for showing Credential Engine courses in the app ──────────
-- Data stays loaded either way. Turn off (e.g. until the licence terms are settled):
--   update public.data_source_settings set enabled = false where source = 'credential_engine';
create table if not exists public.data_source_settings (
  source      text primary key,
  enabled     boolean not null default true,
  note        text,
  updated_at  timestamptz not null default now()
);
alter table public.data_source_settings enable row level security;
drop policy if exists "read data_source_settings" on public.data_source_settings;
create policy "read data_source_settings" on public.data_source_settings for select using (true);
insert into public.data_source_settings (source, enabled, note) values
  ('credential_engine', true, 'Quick-win courses from the Credential Engine registry (short_courses)')
on conflict (source) do nothing;

-- ── Courses: where each row comes from ───────────────────────────────────────
alter table public.training_programs add column if not exists source text not null default 'dol';
alter table public.training_programs drop constraint if exists training_programs_source_check;
alter table public.training_programs add constraint training_programs_source_check check (source in ('dol', 'credential_engine'));
alter table public.training_programs add column if not exists ce_ctid text;          -- Credential Engine ID (also on DOL rows it lists)
alter table public.training_programs add column if not exists ce_finder_url text;    -- credentialfinder.org page
alter table public.training_programs add column if not exists ce_updated_at date;    -- "Last Updated" on Credential Engine
alter table public.training_programs add column if not exists socs_inferred boolean not null default false; -- occupations from the CIP code
create index if not exists training_programs_source_idx on public.training_programs (source);
create unique index if not exists training_programs_ce_ctid_key on public.training_programs (ce_ctid) where ce_ctid is not null;

-- ── Credentials ──────────────────────────────────────────────────────────────
create table if not exists public.credentials (
  id               text primary key,             -- Credential Engine CTID, 'ce-…'
  name             text not null,
  alternate_names  text,
  kind             text not null check (kind in ('license', 'certification', 'badge', 'apprenticeship')),
  type_label       text,                         -- as published: 'License', 'Certification', 'Open Badge'…
  issuer           text not null,
  issuer_type      text not null check (issuer_type in ('government', 'industry')),
  state            text,                         -- postal code for state-issued; null = not tied to a state
  socs             text[] not null default '{}', -- OEWS/SOC codes ('53-3032')
  socs_inferred    text,                         -- null = published; 'occupation_title' = matched from the name
  soc_checked      boolean not null default false,
  cips             text[] not null default '{}',
  description      text,
  status           text not null default 'active',
  url              text,                         -- issuer's page
  ce_finder_url    text,
  ce_updated_at    date,
  source           text not null default 'credential_engine',
  imported_at      timestamptz not null default now()
);
create index if not exists credentials_socs_idx on public.credentials using gin (socs);
create index if not exists credentials_state_idx on public.credentials (state);
alter table public.credentials enable row level security;
drop policy if exists "read credentials" on public.credentials;
create policy "read credentials" on public.credentials for select using (true);

create table if not exists public.course_credentials (
  course_id      text not null references public.training_programs(id) on delete cascade,
  credential_id  text not null references public.credentials(id) on delete cascade,
  relation       text not null default 'prepares_for' check (relation in ('prepares_for', 'awards', 'required_training')),
  match_method   text not null,                  -- issuer_name | state_license | manual
  imported_at    timestamptz not null default now(),
  primary key (course_id, credential_id)
);
create index if not exists course_credentials_credential_idx on public.course_credentials (credential_id);
alter table public.course_credentials enable row level security;
drop policy if exists "read course_credentials" on public.course_credentials;
create policy "read course_credentials" on public.course_credentials for select using (true);

alter table public.occupation_credentials add column if not exists credential_id text
  references public.credentials(id) on delete set null;

-- ── DOL programs that Credential Engine also lists ───────────────────────────
-- p_rows: [{id, ce_ctid, ce_finder_url, ce_updated_at}] — replaces all earlier marks.
create or replace function public.set_ce_matches(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update training_programs set ce_ctid = null, ce_finder_url = null, ce_updated_at = null
   where source = 'dol' and ce_ctid is not null;
  with v as (
    select x->>'id' as id, x->>'ce_ctid' as ce_ctid, x->>'ce_finder_url' as ce_finder_url,
           nullif(x->>'ce_updated_at', '')::date as ce_updated_at
    from jsonb_array_elements(p_rows) x
  ), u as (
    update training_programs t set ce_ctid = v.ce_ctid, ce_finder_url = v.ce_finder_url, ce_updated_at = v.ce_updated_at
    from v where t.id = v.id and t.source = 'dol' returning 1
  )
  select count(*)::int into n from u;
  return n;
end;
$$;
revoke all on function public.set_ce_matches(jsonb) from public, anon, authenticated;

-- ── Licenses without an occupation code ─────────────────────────────────────
-- Most state licenses are published without one. The license name ("Acupuncturist",
-- "LICENSED CERTIFIED NURSE AIDE - License - …") is matched to the O*NET / BLS job titles
-- (occupation_titles, trigram similarity of the whole name); only a close match (≥ 0.7) is kept, and marked as matched.
-- Call repeatedly until checked = 0.
create or replace function public.match_credential_socs(p_limit int default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record; q text; v_soc text; v_score real;
  n_checked int := 0; n_matched int := 0;
begin
  for r in select id, name from credentials
            where cardinality(socs) = 0 and not soc_checked
            order by id limit greatest(1, least(p_limit, 500)) loop
    n_checked := n_checked + 1;
    q := split_part(r.name, ' - ', 1);
    q := regexp_replace(q, '\(.*?\)', ' ', 'g');
    q := regexp_replace(q, '\m(licenses?|licensure|temporary|provisional|permit|renewal|reciprocity|reciprocal|inactive|retired|endorsement|limited|initial|standard)\M', ' ', 'gi');
    q := lower(trim(regexp_replace(regexp_replace(q, '[^a-zA-Z ]', ' ', 'g'), '\s+', ' ', 'g')));
    v_soc := null; v_score := null;
    if length(q) >= 4 then
      -- whole-name similarity (not "appears within a title"): "nurse" must not match "certified nurse aide"
      select t.soc, similarity(q, t.title_lc) into v_soc, v_score
      from occupation_titles t
      where t.title_lc % q
      order by similarity(q, t.title_lc) desc, length(t.title_lc)
      limit 1;
    end if;
    if v_soc is not null and v_score >= 0.7 then
      update credentials set socs = array[v_soc], socs_inferred = 'occupation_title', soc_checked = true where id = r.id;
      n_matched := n_matched + 1;
    else
      update credentials set soc_checked = true where id = r.id;
    end if;
  end loop;
  return jsonb_build_object('checked', n_checked, 'matched', n_matched);
end;
$$;
revoke all on function public.match_credential_socs(int) from public, anon, authenticated;

-- ── Credentials for an occupation (app) ─────────────────────────────────────
-- p_state = postal code ('NJ'). Licenses from the user's state, then certifications.
-- Says nothing about whether a credential is required: that stays in occupation_credentials.
create or replace function public.credentials_for(p_soc text, p_state text default null)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'name', c.name, 'kind', c.kind, 'issuer', c.issuer, 'issuer_type', c.issuer_type,
    'state', c.state, 'url', c.url, 'finder_url', c.ce_finder_url, 'updated_at', c.ce_updated_at,
    'soc_from_name', c.socs_inferred is not null,
    'courses', (select count(*) from course_credentials cc where cc.credential_id = c.id)
  ) order by (c.issuer_type = 'government') desc, c.socs_inferred nulls first, c.name), '[]'::jsonb)
  from credentials c
  where p_soc = any(c.socs) and c.status = 'active'
    and (c.state is null or c.state = p_state);
$$;
grant execute on function public.credentials_for(text, text) to anon, authenticated;

-- ── Graduates' pay: DOL programs only ───────────────────────────────────────
create or replace function public.cip_soc_shares()
returns table (cip4 text, length_class text, soc text, programs integer, share numeric)
language sql stable
set search_path = public
as $$
  with p as (
    select left(cip, 5) as cip4,
           case when credential ~* '(associate|\maas\M|aas-t|\mata\M|a\.a\.s)' then '03'
                when weeks > 0 and weeks < 52 then '01'
                when weeks >= 52 and weeks <= 104 then '02' end as length_class,
           socs
    from training_programs
    where cip ~ '^\d{2}\.\d{2}' and source = 'dol'
  ), c as (
    select cip4, length_class, count(*) as n from p where length_class is not null group by 1, 2
  )
  select p.cip4, p.length_class, s.soc, count(*)::int, round(count(*)::numeric / c.n, 3)
  from p
  cross join lateral unnest(p.socs) as s(soc)
  join c on c.cip4 = p.cip4 and c.length_class = p.length_class
  group by p.cip4, p.length_class, s.soc, c.n;
$$;

-- ── Approved training screen: DOL programs only ─────────────────────────────
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
    from training_programs t where p_soc = any(t.socs) and t.source = 'dol'
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

-- ── Quick-win courses: DOL + Credential Engine ──────────────────────────────
-- Same as 20261027020000_course_supervisor_match.sql, except:
--   * Credential Engine courses may have total hours but no weeks (weeks unknown → counted as 1 for
--     the ≤ 6 weeks rule; the course card then says "About N hours", never a made-up number of weeks)
--   * each course returns leads_to: the credentials it prepares for (course_credentials)
--   * among equally good courses, DOL ones (with past-student results) come first
create or replace function public.short_courses(
  p_socs text[], p_own_soc text default null, p_state text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_limit int default 5, p_promo_socs text[] default null, p_max_miles int default 10
)
returns jsonb
language sql stable
set search_path = public
as $$
  with entry as (
    select cip from training_programs
    where p_own_soc is not null and p_own_soc = any(socs) and source = 'dol'
    group by cip order by count(*) desc limit 1
  ),
  c as materialized (
    select * from (
      select t.*,
             t.hours_per_week * greatest(t.weeks, 1) as total_hours,
             case when p_lat is not null and t.lat is not null
                  then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
             t.socs[1] as for_soc,
             case when t.socs[1] = p_own_soc then 0 when t.socs[1] = any(coalesce(p_promo_socs, '{}')) then 1 else 2 end as tier
      from training_programs t
      where t.socs && p_socs
        and t.socs[1] = any(p_socs)
        and t.hours_per_week is not null
        and (t.weeks is not null or t.source = 'credential_engine')
        and (t.source = 'dol'
             or coalesce((select s.enabled from data_source_settings s where s.source = t.source), false))
    ) a
    where total_hours >= 3
      and (coalesce(tuition, 0) <= 0 or tuition / total_hours <= 150)
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null
            and distance_mi <= least(100, greatest(10, coalesce(p_max_miles, 10)))
            and coalesce(weeks, 1) <= 6 and total_hours <= 48)
      )
  ),
  d as materialized (
    select c.*,
           course_is_national(coalesce(c.credential, '') || ' ' || c.name) as national,
           course_is_module(c.name) as module,
           (p_state is not null and c.state is distinct from p_state
            and course_state_only(coalesce(c.credential, '') || ' ' || c.name, p_state)) as other_state_only,
           course_is_refresher(coalesce(c.credential, '') || ' ' || c.name) as refresher
    from c
  ),
  q as (
    select * from d
    where not (p_own_soc is not null and for_soc = p_own_soc and cip = (select cip from entry)
               and not exists (select 1 from unnest(socs) s where s = any(p_socs) and s <> p_own_soc))
      and not (module and not national)
      and not (other_state_only and not national)
      and not refresher
      -- A course whose main job is a trade-wide supervisor code (e.g. 47-1011 "First-Line Supervisors of
      -- Construction Trades") counts toward the user's promotion only when it is a leadership course or
      -- also lists the user's own job — not, say, a tile course for an electrician (Amit, 2026-10-27)
      and not (for_soc is distinct from p_own_soc
               and course_is_supervisor_soc(for_soc)
               and not course_is_leadership(coalesce(credential, '') || ' ' || name)
               and not (p_own_soc is not null and p_own_soc = any(socs)))
  ),
  best as (select * from q where tier = (select min(tier) from q))
  select coalesce(jsonb_agg(
    (to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state' - 'national' - 'module' - 'other_state_only' - 'refresher' - 'tier')
    || jsonb_build_object('leads_to', (
         select jsonb_agg(jsonb_build_object('name', cr.name, 'issuer', cr.issuer, 'kind', cr.kind, 'finder_url', cr.ce_finder_url)
                          order by cr.issuer_type, cr.name)
         from course_credentials cc join credentials cr on cr.id = cc.credential_id
         where cc.course_id = x.id))
  ), '[]'::jsonb)
  from (
    select * from best
    order by (format <> 'online') desc,
             (state = p_state) desc,
             (source = 'dol') desc,          -- DOL courses (with past-student results) before Credential Engine ones
             national desc,
             (url is not null) desc,
             (completion_rate is not null or median_q2_earnings is not null) desc,
             -- beyond 10 miles (only when the user drives further): nearest first; within 10 miles the order is unchanged
             case when distance_mi > 10 then distance_mi end asc nulls first,
             total_hours asc,
             completion_rate desc nulls last
    limit greatest(1, least(p_limit, 20))
  ) x;
$$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int, text[], int) to anon, authenticated;
