-- ─────────────────────────────────────────────────────────────────────────────
-- Career paths per occupation (decisions with Amit, 2026-10-19; claude/career-paths.md)
--
-- Key everywhere: the OEWS SOC code (public.occupations.soc), e.g. '53-3032'.
--
-- 1. occupation_job_zones   O*NET Job Zone (1–5: how much preparation the job needs)
-- 2. occupation_skills      O*NET Transferable Skills: importance (1–5) and level (0–7)
-- 3. supervisor_rules       SOC group → its first-line supervisor occupation (curated, SOC 2018)
-- 4. occupation_links       advancement / career-change / lower-pay moves per occupation
--                           (filled by refresh-benchmarks {"job":"careerpaths"})
-- 5. occupation_credentials mandatory licenses / certifications / training per occupation
--                           (federal rows seeded here; state licenses to come from CareerOneStop).
--                           Never assumed held — the app asks the user.
-- 6. occupation_entry_pay   pay in the first year or two in the job (filled by refresh-entry-pay)
-- 7. cip_soc_shares()       which occupations DOL training programs of each kind lead to
-- 8. entry_pay(), career_links(), occupation_credentials_for() — what the app calls
--
-- Revert: drop function entry_pay, career_links, occupation_credentials_for, cip_soc_shares;
--         drop table occupation_entry_pay, occupation_credentials, occupation_links,
--         supervisor_rules, occupation_skills, occupation_job_zones;
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.occupation_job_zones (
  soc           text primary key,
  job_zone      smallint not null check (job_zone between 1 and 5),
  onet_codes    text[],
  onet_version  text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.occupation_skills (
  soc           text not null,
  skill         text not null,                -- O*NET element name, e.g. 'Troubleshooting'
  importance    numeric,                      -- 1..5
  level         numeric,                      -- 0..7
  onet_version  text,
  updated_at    timestamptz not null default now(),
  primary key (soc, skill)
);

create table if not exists public.supervisor_rules (
  prefix          text primary key,           -- SOC prefix; the longest match wins
  supervisor_soc  text not null,              -- OEWS code of the first-line supervisor
  note            text
);

create table if not exists public.occupation_links (
  soc            text not null,
  target_soc     text not null,
  kind           text not null check (kind in ('advancement', 'career_change', 'lower_pay')),
  basis          text[] not null,             -- supervisor | job_zone | pay | related
  related_tier   text,                        -- O*NET: Primary-Short | Primary-Long | Supplemental
  related_rank   integer,
  direction      text,                        -- listed (O*NET lists target for soc) | reverse
  job_zone_from  smallint,
  job_zone_to    smallint,
  median_from    numeric,                     -- OEWS national median, yearly
  median_to      numeric,
  pay_ratio      numeric,
  skill_gaps     jsonb,                       -- [{skill, gap}] important skills the target needs at a higher level
  wage_period    text,
  onet_version   text,
  updated_at     timestamptz not null default now(),
  primary key (soc, target_soc)
);
create index if not exists occupation_links_kind_idx on public.occupation_links (soc, kind);

create table if not exists public.occupation_credentials (
  id           bigserial primary key,
  soc          text not null,
  state        text,                          -- state FIPS; null = everywhere
  name         text not null,
  kind         text not null check (kind in ('license', 'certification', 'endorsement', 'training')),
  mandatory    boolean not null default true, -- false = only for some of the jobs (see condition)
  condition    text,
  authority    text,
  source_url   text not null,
  checked_at   date not null default current_date,
  unique nulls not distinct (soc, state, name)
);

create table if not exists public.occupation_entry_pay (
  soc          text not null,
  area_code    text not null,                 -- 'US' or state FIPS
  method       text not null check (method in ('graduates_pseo', 'graduates_eta', 'new_entrants_cps', 'young_fulltime_cps')),
  annual       numeric not null,              -- yearly, in dollar_year dollars
  n            integer not null,              -- graduates or survey responses behind the figure
  period       text,
  dollar_year  integer,
  detail       jsonb,
  updated_at   timestamptz not null default now(),
  primary key (soc, area_code, method)
);

do $$
declare t text;
begin
  foreach t in array array['occupation_job_zones', 'occupation_skills', 'supervisor_rules',
                           'occupation_links', 'occupation_credentials', 'occupation_entry_pay'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read %s" on public.%I', t, t);
    execute format('create policy "read %s" on public.%I for select using (true)', t, t);
  end loop;
end $$;

-- ── Supervisors (SOC 2018 structure; OEWS codes) ────────────────────────────
insert into public.supervisor_rules (prefix, supervisor_soc, note) values
  ('33-2',   '33-1021', 'firefighting → fire supervisors'),
  ('33-301', '33-1011', 'correctional officers → correctional supervisors'),
  ('33-3',   '33-1012', 'police → police supervisors'),
  ('33-9',   '33-1091', 'security and other protective → security supervisors'),
  ('35-201', '35-1011', 'cooks → chefs and head cooks'),
  ('35-2',   '35-1012', 'food preparation → food service supervisors'),
  ('35-3',   '35-1012', 'food and beverage serving → food service supervisors'),
  ('35-9',   '35-1012', 'other food service → food service supervisors'),
  ('37-2',   '37-1011', 'cleaning → housekeeping and janitorial supervisors'),
  ('37-3',   '37-1012', 'grounds maintenance → landscaping supervisors'),
  ('39-301', '39-1013', 'gambling services → gambling supervisors'),
  ('39-3',   '39-1014', 'entertainment attendants → entertainment supervisors'),
  ('39-4',   '39-1022', 'personal service → personal service supervisors'),
  ('39-5',   '39-1022', 'personal appearance → personal service supervisors'),
  ('39-6',   '39-1022', 'baggage porters, concierges → personal service supervisors'),
  ('39-7',   '39-1022', 'tour and travel guides → personal service supervisors'),
  ('39-9',   '39-1022', 'other personal care → personal service supervisors'),
  ('41-2',   '41-1011', 'retail sales → retail sales supervisors'),
  ('41-3',   '41-1012', 'sales representatives, services → non-retail sales supervisors'),
  ('41-4',   '41-1012', 'wholesale and manufacturing sales → non-retail sales supervisors'),
  ('41-9',   '41-1012', 'other sales → non-retail sales supervisors'),
  ('43-',    '43-1011', 'office and administrative support → office supervisors'),
  ('45-2',   '45-1011', 'agricultural workers → farming supervisors'),
  ('45-3',   '45-1011', 'fishing and hunting → farming supervisors'),
  ('45-4',   '45-1011', 'forest and logging → farming supervisors'),
  ('47-2',   '47-1011', 'construction trades → construction supervisors'),
  ('47-3',   '47-1011', 'construction helpers → construction supervisors'),
  ('47-4',   '47-1011', 'other construction → construction supervisors'),
  ('47-5',   '47-1011', 'extraction → construction and extraction supervisors'),
  ('49-2',   '49-1011', 'electrical and electronic repair → mechanic supervisors'),
  ('49-3',   '49-1011', 'vehicle and mobile equipment mechanics → mechanic supervisors'),
  ('49-9',   '49-1011', 'other installation and repair → mechanic supervisors'),
  ('51-',    '51-1011', 'production → production supervisors'),
  ('53-3',   '53-1047', 'motor vehicle operators → transportation supervisors'),
  ('53-4',   '53-1047', 'rail transportation → transportation supervisors'),
  ('53-5',   '53-1047', 'water transportation → transportation supervisors'),
  ('53-6',   '53-1047', 'other transportation → transportation supervisors'),
  ('53-7',   '53-1047', 'material moving → transportation and material moving supervisors')
on conflict (prefix) do update set supervisor_soc = excluded.supervisor_soc, note = excluded.note;

-- ── Federal and nationwide credentials ──────────────────────────────────────
-- Local permits (taxi / for-hire) are deliberately left out (decision 2026-10-19).
insert into public.occupation_credentials (soc, state, name, kind, mandatory, condition, authority, source_url) values
  ('53-3032', null, 'Commercial Driver''s License (CDL) Class A', 'license', true,
   'To drive combination vehicles over 26,000 lb (49 CFR 383)', 'State DMV under FMCSA rules',
   'https://www.fmcsa.dot.gov/registration/commercial-drivers-license'),
  ('53-3032', null, 'Entry-Level Driver Training (ELDT)', 'training', true,
   'Before the first Class A or B CDL skills test, from a provider on FMCSA''s Training Provider Registry (49 CFR 380)', 'FMCSA',
   'https://tpr.fmcsa.dot.gov/'),
  ('53-3032', null, 'DOT medical examiner''s certificate', 'certification', true,
   'To drive commercial vehicles in interstate commerce (49 CFR 391.41)', 'FMCSA',
   'https://www.fmcsa.dot.gov/medical/driver-medical-requirements/driver-medical-fitness-duty'),
  ('53-3052', null, 'CDL Class B with Passenger (P) endorsement', 'license', true,
   'To drive vehicles designed for 16 or more people including the driver (49 CFR 383)', 'State DMV under FMCSA rules',
   'https://www.fmcsa.dot.gov/registration/commercial-drivers-license'),
  ('53-3052', null, 'DOT medical examiner''s certificate', 'certification', true,
   'To drive commercial vehicles in interstate commerce (49 CFR 391.41)', 'FMCSA',
   'https://www.fmcsa.dot.gov/medical/driver-medical-requirements/driver-medical-fitness-duty'),
  ('53-3051', null, 'CDL with Passenger (P) and School Bus (S) endorsements', 'license', true,
   'To drive a school bus (49 CFR 383)', 'State DMV under FMCSA rules',
   'https://www.fmcsa.dot.gov/registration/commercial-drivers-license'),
  ('53-3053', null, 'CDL with Passenger (P) endorsement', 'license', false,
   'Only for vehicles designed for 16 or more people including the driver', 'State DMV under FMCSA rules',
   'https://www.fmcsa.dot.gov/registration/commercial-drivers-license'),
  ('53-3054', null, 'Driver''s license', 'license', true, null, 'State DMV', 'https://www.usa.gov/motor-vehicle-services'),
  ('53-3053', null, 'Driver''s license', 'license', true, null, 'State DMV', 'https://www.usa.gov/motor-vehicle-services'),
  ('53-3033', null, 'Driver''s license', 'license', true, null, 'State DMV', 'https://www.usa.gov/motor-vehicle-services'),
  ('53-3031', null, 'Driver''s license', 'license', true, null, 'State DMV', 'https://www.usa.gov/motor-vehicle-services'),
  ('53-7051', null, 'Forklift (powered industrial truck) operator training and evaluation', 'training', true,
   'Given and certified by the employer; re-evaluated at least every 3 years (29 CFR 1910.178(l))', 'OSHA',
   'https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.178'),
  ('31-1131', null, 'Certified nurse aide (state nurse aide registry)', 'certification', true,
   'To work in a nursing home for more than 4 months (42 CFR 483.35(d)); at least 75 hours of training (42 CFR 483.152). Hospitals may not require it.', 'State nurse aide registry under CMS rules',
   'https://www.law.cornell.edu/cfr/text/42/483.35'),
  ('31-1120', null, 'Home health aide training and competency evaluation', 'certification', false,
   'For aides of Medicare-certified home health agencies (42 CFR 484.80); not required for personal care aides', 'CMS',
   'https://www.law.cornell.edu/cfr/text/42/484.80'),
  ('49-9021', null, 'EPA Section 608 technician certification', 'certification', true,
   'To maintain, service, repair or dispose of equipment that could release refrigerant (40 CFR 82.161)', 'U.S. EPA',
   'https://www.epa.gov/section608/section-608-technician-certification-requirements'),
  ('49-3023', null, 'EPA Section 609 certification', 'certification', false,
   'Only to service motor vehicle air conditioning (40 CFR 82.34)', 'U.S. EPA',
   'https://www.epa.gov/mvac/section-609-technician-training-and-certification-programs'),
  ('29-2061', null, 'Practical / vocational nurse license (NCLEX-PN)', 'license', true,
   'Every state; issued by the state board of nursing', 'State board of nursing', 'https://www.ncsbn.org/exams.page'),
  ('29-1141', null, 'Registered nurse license (NCLEX-RN)', 'license', true,
   'Every state; issued by the state board of nursing', 'State board of nursing', 'https://www.ncsbn.org/exams.page'),
  ('29-2042', null, 'EMT certification', 'certification', true,
   'Issued by the state; most states use the NREMT exam', 'State EMS office', 'https://www.nremt.org/'),
  ('47-2111', null, 'Electrician license', 'license', true,
   'Required in most states or cities; rules vary by state', 'State or local licensing board',
   'https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx'),
  ('47-2152', null, 'Plumber license', 'license', true,
   'Required in most states or cities; rules vary by state', 'State or local licensing board',
   'https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx'),
  ('39-5012', null, 'Cosmetology license', 'license', true,
   'Every state; issued by the state cosmetology board', 'State cosmetology board',
   'https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx')
on conflict (soc, state, name) do update set
  kind = excluded.kind, mandatory = excluded.mandatory, condition = excluded.condition,
  authority = excluded.authority, source_url = excluded.source_url, checked_at = current_date;

-- ── Which occupations DOL training programs of each kind lead to ────────────
-- Length class matches Census PSEO degree levels: 01 certificate < 1 year,
-- 02 certificate 1–2 years, 03 associate degree.
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
    where cip ~ '^\d{2}\.\d{2}'
  ), c as (
    select cip4, length_class, count(*) as n from p where length_class is not null group by 1, 2
  )
  select p.cip4, p.length_class, s.soc, count(*)::int, round(count(*)::numeric / c.n, 3)
  from p
  cross join lateral unnest(p.socs) as s(soc)
  join c on c.cip4 = p.cip4 and c.length_class = p.length_class
  group by p.cip4, p.length_class, s.soc, c.n;
$$;

-- ── Entry pay for one occupation ────────────────────────────────────────────
-- Best figure first: graduates in the user's state → graduates nationally ×
-- the state's pay level for this job → people new to the job (national CPS)
-- × state level → young full-time workers × state level. Within a step the
-- lower figure wins (conservative). Needs at least 30 graduates / responses.
-- Graduate figures count part-time and out-of-field work too, so one below the
-- job's 10th percentile (OEWS, state if known) is skipped in favour of the next step.
-- p_state = state FIPS ('34') or null for national.
create or replace function public.entry_pay(p_soc text, p_state text default null)
returns jsonb
language sql stable
set search_path = public
as $$
  with lvl as (
    select coalesce(
      (select s.p50 / nullif(n.p50, 0) from latest_wage_benchmarks s
         join latest_wage_benchmarks n on n.soc = s.soc and n.area_type = 'national'
        where p_state is not null and s.soc = p_soc and s.area_type = 'state' and s.area_code = p_state),
      (select s.p50 / nullif(n.p50, 0) from latest_wage_benchmarks s
         join latest_wage_benchmarks n on n.soc = s.soc and n.area_type = 'national'
        where p_state is not null and s.soc = '00-0000' and s.area_type = 'state' and s.area_code = p_state),
      1) as f
  ), floor10 as (
    select coalesce(
      (select s.p10 from latest_wage_benchmarks s
        where p_state is not null and s.soc = p_soc and s.area_type = 'state' and s.area_code = p_state),
      (select n.p10 from latest_wage_benchmarks n where n.soc = p_soc and n.area_type = 'national') * (select f from lvl)
    ) as p10
  ), cand as (
    select e.*, 1 as step, 1::numeric as f from occupation_entry_pay e
     where p_state is not null and e.soc = p_soc and e.area_code = p_state
       and e.method in ('graduates_pseo', 'graduates_eta') and e.n >= 30
    union all
    select e.*, 2, (select f from lvl) from occupation_entry_pay e
     where e.soc = p_soc and e.area_code = 'US' and e.method in ('graduates_pseo', 'graduates_eta') and e.n >= 30
    union all
    select e.*, 3, (select f from lvl) from occupation_entry_pay e
     where e.soc = p_soc and e.area_code = 'US' and e.method = 'new_entrants_cps' and e.n >= 30
    union all
    select e.*, 4, (select f from lvl) from occupation_entry_pay e
     where e.soc = p_soc and e.area_code = 'US' and e.method = 'young_fulltime_cps' and e.n >= 30
  )
  select jsonb_build_object(
    'annual', round(annual * f / 100) * 100,
    'method', method,
    'area', area_code,
    'state_adjusted', f <> 1,
    'n', n,
    'period', period,
    'dollar_year', dollar_year,
    'source', case method
      when 'graduates_pseo' then 'U.S. Census Bureau, Post-Secondary Employment Outcomes'
      when 'graduates_eta' then 'U.S. Department of Labor, ETA-9171 training provider results'
      else 'U.S. Census Bureau, Current Population Survey' end)
  from cand
  where method not in ('graduates_pseo', 'graduates_eta')
     or annual * f >= coalesce((select p10 from floor10), 0)
  order by step, annual * f
  limit 1;
$$;

-- ── Mandatory credentials for one occupation (state rows + nationwide rows) ─
create or replace function public.occupation_credentials_for(p_soc text, p_state text default null)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', name, 'kind', kind, 'mandatory', mandatory, 'condition', condition,
    'authority', authority, 'source_url', source_url, 'state', state
  ) order by mandatory desc, name), '[]'::jsonb)
  from occupation_credentials
  where soc = p_soc and (state is null or state = p_state);
$$;

-- ── Moves from one occupation ───────────────────────────────────────────────
create or replace function public.career_links(p_soc text, p_state text default null, p_include_lower boolean default false)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by k, r desc), '[]'::jsonb)
  from (
    select case l.kind when 'advancement' then 1 when 'career_change' then 2 else 3 end as k,
           l.pay_ratio as r,
           jsonb_build_object(
             'soc', l.target_soc, 'title', o.title, 'kind', l.kind, 'basis', l.basis,
             'pay_ratio', l.pay_ratio, 'median_national', l.median_to,
             'median_state', ms.p50,
             -- Pay used for the move's value: the state median; when BLS has no state
             -- figure loaded for this job, the national median × the state's
             -- all-occupations level (state median ÷ national median).
             'median_local', round(coalesce(ms.p50, l.median_to * coalesce(lvl.f, 1))),
             'median_local_basis', case when ms.p50 is not null then 'state'
                                        when lvl.f is not null then 'estimated' else 'national' end,
             'entry_pay', entry_pay(l.target_soc, p_state),
             'job_zone_from', l.job_zone_from, 'job_zone_to', l.job_zone_to,
             'skill_gaps', l.skill_gaps,
             'credentials', occupation_credentials_for(l.target_soc, p_state),
             'related_tier', l.related_tier, 'wage_period', l.wage_period, 'onet_version', l.onet_version
           ) as x
    from occupation_links l
    join occupations o on o.soc = l.target_soc
    left join lateral (select w.p50 from latest_wage_benchmarks w
                        where w.soc = l.target_soc and w.area_type = 'state' and w.area_code = p_state) ms on true
    left join lateral (select s.p50 / nullif(n.p50, 0) as f from latest_wage_benchmarks s
                         join latest_wage_benchmarks n on n.soc = s.soc and n.area_type = 'national'
                        where p_state is not null and s.soc = '00-0000' and s.area_type = 'state' and s.area_code = p_state) lvl on true
    where l.soc = p_soc and (p_include_lower or l.kind <> 'lower_pay')
  ) t;
$$;

grant execute on function public.entry_pay(text, text) to anon, authenticated;
grant execute on function public.occupation_credentials_for(text, text) to anon, authenticated;
grant execute on function public.career_links(text, text, boolean) to anon, authenticated;
