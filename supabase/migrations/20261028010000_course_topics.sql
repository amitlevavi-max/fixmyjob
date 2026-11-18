-- Short courses that usually help people in each job (SOC), best first (Amit, 2026-10-28).
-- Made once a year by scripts/course-topics/generate.mjs; suggest-course tells the
-- AI search to look for these first. Internal only: never shown as a fact in the app.
create table if not exists public.course_topics (
  soc          text primary key,
  title        text,
  topics       jsonb not null default '[]'::jsonb,  -- [{name, search, credential, issuer, hours, delivery, helps}]
  model        text,
  generated_at timestamptz not null default now()
);
alter table public.course_topics enable row level security;
revoke all on public.course_topics from anon, authenticated;
