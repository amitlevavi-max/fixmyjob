-- ─────────────────────────────────────────────────────────────────────────────
-- Full occupation catalogue + everyday job titles + fuzzy search
--
--   occupations         ~830 BLS OEWS detailed occupations (SOC codes)
--   occupation_titles   ~57k everyday / alternate job titles (O*NET, CC BY 4.0)
--                       mapped to those occupations, e.g. "front desk agent"
--                       → 43-4081 Hotel, Motel, and Resort Desk Clerks
--   occupation_sources  which source versions are loaded
--   search_occupations(q)  ranked matches for what a user types
--
-- Filled by the refresh-benchmarks Edge Function ({"job":"occupations"}).
-- Data: U.S. Bureau of Labor Statistics; O*NET® Database by the U.S. Department
-- of Labor, Employment and Training Administration, used under CC BY 4.0.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.occupations (
  soc          text primary key,          -- '43-4081'
  title        text not null,             -- 'Hotel, Motel, and Resort Desk Clerks'
  major_group  text not null,             -- '43'
  updated_at   timestamptz not null default now()
);

create table if not exists public.occupation_titles (
  id        bigserial primary key,
  soc       text not null references public.occupations(soc) on delete cascade,
  title     text not null,
  title_lc  text not null,
  source    text not null default 'onet',  -- 'onet' | 'bls'
  unique (soc, title_lc)
);
create index if not exists occupation_titles_trgm
  on public.occupation_titles using gin (title_lc extensions.gin_trgm_ops);

create table if not exists public.occupation_sources (
  source      text primary key,            -- 'bls_oews_occupations' | 'onet_job_titles'
  version     text,
  rows        integer,
  imported_at timestamptz not null default now()
);

alter table public.occupations        enable row level security;
alter table public.occupation_titles  enable row level security;
alter table public.occupation_sources enable row level security;
drop policy if exists "read occupations" on public.occupations;
create policy "read occupations" on public.occupations for select using (true);
drop policy if exists "read occupation_titles" on public.occupation_titles;
create policy "read occupation_titles" on public.occupation_titles for select using (true);
drop policy if exists "read occupation_sources" on public.occupation_sources;
create policy "read occupation_sources" on public.occupation_sources for select using (true);

-- ── Search ───────────────────────────────────────────────────────────────────
-- Best-matching occupations for free text, with the everyday title that
-- matched and national wages (if loaded). Score 0–1: 1 = exact title,
-- ≤0.9 = the text appears within a title (fuzzy), lower = looser match.
create or replace function public.search_occupations(q text, lim int default 6)
returns table (
  soc text, title text, matched_title text, score real,
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric, period text
)
language sql stable
set search_path = public, extensions
as $$
  with query as (select lower(trim(q)) as q),
  hits as (
    select t.soc, t.title as matched_title,
           case when t.title_lc = query.q then 1.0::real
                else greatest(0.9 * word_similarity(query.q, t.title_lc), similarity(query.q, t.title_lc))::real end as score
    from public.occupation_titles t, query
    where length(query.q) >= 2
      and (t.title_lc % query.q or query.q <% t.title_lc)
  ),
  best as (
    select distinct on (soc) soc, matched_title, score
    from hits order by soc, score desc, length(matched_title)
  )
  select b.soc, o.title, b.matched_title, b.score,
         w.p10, w.p25, w.p50, w.p75, w.p90, w.period
  from best b
  join public.occupations o on o.soc = b.soc
  left join public.latest_wage_benchmarks w
    on w.soc = b.soc and w.area_type = 'national'
  order by b.score desc, o.title
  limit greatest(1, least(lim, 20));
$$;

grant execute on function public.search_occupations(text, int) to anon, authenticated;

-- ── Demand-driven state wages ────────────────────────────────────────────────
-- When a user saves an occupation, start tracking it so the daily refresh
-- loads its state-level wages too.
create or replace function public.track_user_occupation()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.occupation_soc is not null then
    insert into public.tracked_occupations (soc, title)
    select o.soc, o.title from public.occupations o where o.soc = new.occupation_soc
    on conflict (soc) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_track_occupation on public.user_profiles;
create trigger user_profiles_track_occupation
  after insert or update of occupation_soc on public.user_profiles
  for each row execute function public.track_user_occupation();
