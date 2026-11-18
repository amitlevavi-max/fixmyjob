-- App language chosen by the user ('en' or 'es'). Saved when they sign in and
-- when they change it in Profile → Preferences. Kept for later use (e.g.
-- sending emails in their language); the app itself reads the choice from the phone.
alter table public.user_profiles
  add column if not exists language text check (language in ('en', 'es'));
