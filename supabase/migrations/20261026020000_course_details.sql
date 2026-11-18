-- ─────────────────────────────────────────────────────────────────────────────
-- Course details for the short-course Quick win (Amit, 2026-10-26)
--
-- 1. training_programs gets the provider's address and the program description
--    (DOL list, DE103 / DE106) — loaded by scripts/import-program-details.mjs.
-- 2. course_contact_cache: phone, email and web pages for a program, found by a
--    live web search on the provider's own site (Edge Function course-contact),
--    kept 90 days. Only the Edge Function (service role) reads and writes it.
-- 3. short_courses(): skips courses whose recorded length can't be right (more
--    than $150 of tuition per hour of teaching — e.g. "$3,400 for 4 hours"), and
--    prefers courses that lead to a national certification (valid in every state),
--    then courses with a web address, then with reported results.
--
-- After `npx supabase db push`:
--   node scripts/import-program-details.mjs            (same two $env lines as the hours import)
--   npx supabase functions deploy course-contact
--
-- Revert: drop function public.set_program_details(jsonb); drop table public.course_contact_cache;
--         alter table public.training_programs drop column address, drop column description;
--         re-run short_courses from 20261026010000_short_courses.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.training_programs add column if not exists address text;
alter table public.training_programs add column if not exists description text;

create or replace function public.set_program_details(p jsonb)
returns int
language sql
security definer
set search_path = public
as $$
  with v as (select key as id, value->>0 as address, value->>1 as description from jsonb_each(p)),
  u as (update training_programs t set address = v.address, description = v.description from v where t.id = v.id returning 1)
  select count(*)::int from u;
$$;
revoke all on function public.set_program_details(jsonb) from public, anon, authenticated;

create table if not exists public.course_contact_cache (
  program_id  text primary key,
  contact     jsonb not null,          -- {website, program_url, phone, email, sources:{…}}
  model       text,
  found_at    timestamptz not null default now()
);
alter table public.course_contact_cache enable row level security;   -- Edge Function only (service role)

create or replace function public.short_courses(
  p_socs text[], p_own_soc text default null, p_state text default null,
  p_lat double precision default null, p_lon double precision default null,
  p_limit int default 5
)
returns jsonb
language sql stable
set search_path = public
as $$
  with entry as (
    select cip from training_programs
    where p_own_soc is not null and p_own_soc = any(socs)
    group by cip order by count(*) desc limit 1
  ),
  c as (
    select t.*,
           t.hours_per_week * greatest(t.weeks, 1) as total_hours,
           case when p_lat is not null and t.lat is not null
                then round(miles(p_lat, p_lon, t.lat, t.lon)::numeric, 1) end as distance_mi,
           (select s from unnest(t.socs) s where s = any(p_socs) limit 1) as for_soc
    from training_programs t
    where t.socs && p_socs
      and t.hours_per_week is not null and t.weeks is not null
  ),
  q as (
    select * from c
    where total_hours >= 3
      -- a length that can't be right for the price (DOL records are sometimes misreported)
      and (coalesce(tuition, 0) <= 0 or tuition / total_hours <= 150)
      and not (p_own_soc is not null and for_soc = p_own_soc and cip = (select cip from entry)
               and not exists (select 1 from unnest(socs) s where s = any(p_socs) and s <> p_own_soc))
      and (
        (format = 'online' and total_hours < 30)
        or (format <> 'online' and distance_mi is not null and distance_mi <= 10
            and weeks <= 6 and total_hours <= 48)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) - 'imported_at' - 'provider_id' - 'reporting_state'), '[]'::jsonb)
  from (
    select * from q
    order by (format <> 'online') desc,
             (state = p_state) desc,
             -- a national certification is valid in every state
             (coalesce(credential, '') || ' ' || name) ~* '(AMCA|NHA|NCCT|NCCER|AAPC|AHIMA|CompTIA|NIMS|OSHA|ServSafe|American Heart|AHA|BLS|CPR|Red Cross|First Aid|AWS|EPA 608|NATE|ASE|NRAES|NREMT|Microsoft|Google|Forklift)' desc,
             (url is not null) desc,
             (completion_rate is not null or median_q2_earnings is not null) desc,
             total_hours asc,
             completion_rate desc nulls last
    limit greatest(1, least(p_limit, 20))
  ) x;
$$;
grant execute on function public.short_courses(text[], text, text, double precision, double precision, int) to anon, authenticated;
