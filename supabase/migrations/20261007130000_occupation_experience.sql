-- ─────────────────────────────────────────────────────────────────────────────
-- Related work experience needed to be hired, per OEWS occupation, from
-- O*NET (U.S. Dept. of Labor / ETA, CC BY 4.0) — element 3.A.1, scale RW.
-- Filled by refresh-benchmarks ({"job":"experience"}), refreshed with the
-- occupation catalogue (every 30 days).
--   dist        % of respondents per category 1..11 (index 0 = category 1)
--   median_cat  category where the cumulative share reaches 50%
--   p25_cat / p75_cat  the middle half of answers
-- Categories: 1 none · 2 ≤1 mo · 3 1–3 mo · 4 3–6 mo · 5 6–12 mo · 6 1–2 yrs
--             7 2–4 yrs · 8 4–6 yrs · 9 6–8 yrs · 10 8–10 yrs · 11 >10 yrs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.occupation_experience (
  soc           text primary key references public.occupations(soc) on delete cascade,
  dist          jsonb not null,
  median_cat    smallint not null,
  p25_cat       smallint not null,
  p75_cat       smallint not null,
  onet_codes    text[] not null,          -- O*NET-SOC codes averaged into this row
  low_precision boolean not null default false,
  onet_version  text,
  updated_at    timestamptz not null default now()
);
alter table public.occupation_experience enable row level security;
drop policy if exists "read occupation_experience" on public.occupation_experience;
create policy "read occupation_experience" on public.occupation_experience for select using (true);
