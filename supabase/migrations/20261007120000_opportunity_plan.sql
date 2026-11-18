-- ─────────────────────────────────────────────────────────────────────────────
-- The user's plan: for each opportunity they looked at, whether they added it
-- to their plan or decided not to pursue it.
--   { "cdl-class-b": "in_plan", "multi-app": "not_pursuing", … }
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.user_profiles
  add column if not exists opportunity_plan jsonb not null default '{}'::jsonb;
