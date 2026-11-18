-- The BLS occupation (SOC code) the user picked or confirmed, e.g. '35-2021'.
-- Used for wage benchmarks and the union pay premium. Null = no close match
-- (the app then compares with US workers overall).
alter table public.user_profiles
  add column if not exists occupation_soc text;
