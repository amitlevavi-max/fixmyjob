-- ─────────────────────────────────────────────────────────────────────────────
-- Lock down user_profiles (found 2026-10-27)
--
-- The live table could be read by ANYONE with the app's public (publishable)
-- key: all profiles, with pay, employer, job, location, ZIP, job-offer email,
-- plan. supabase/schema.sql has row-level security for this table, but it was
-- never applied to the live database.
--
-- After this: each signed-in user can read, add and change only their own row.
-- Edge Functions and scripts that use the service-role key are not affected.
--
-- Check after pushing (should return [] or 401 with the publishable key):
--   GET /rest/v1/user_profiles?select=id   (no user signed in)
-- Revert: alter table public.user_profiles disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles enable row level security;

drop policy if exists "Users can view own profile"   on public.user_profiles;
drop policy if exists "Users can insert own profile" on public.user_profiles;
drop policy if exists "Users can update own profile" on public.user_profiles;
drop policy if exists "Users can delete own profile" on public.user_profiles;

create policy "Users can view own profile" on public.user_profiles
  for select to authenticated using (auth.uid() = id);
create policy "Users can insert own profile" on public.user_profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "Users can update own profile" on public.user_profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Signed-out visitors get nothing
revoke all on public.user_profiles from anon;
