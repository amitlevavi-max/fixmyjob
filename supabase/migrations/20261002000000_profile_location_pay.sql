-- ─────────────────────────────────────────────────────────────────────────────
-- Store location, hourly pay and work schedule on the user's profile so they
-- survive sign-out / sign-in and switching phones. The app saves these the
-- moment the user enters them (src/lib/profileSync.ts).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles
  add column if not exists location_state      text,      -- 'NJ'
  add column if not exists location_state_name text,      -- 'New Jersey'
  add column if not exists location_is_metro   boolean,   -- city/metro vs rural
  add column if not exists location_metro      text,      -- 'Newark / Jersey City'
  add column if not exists hourly_rate         numeric(7,2),
  add column if not exists work_schedule       jsonb;     -- hours/week, days, weekend hours, premiums

comment on column public.user_profiles.location is 'Human-readable location label, e.g. "Newark / Jersey City, NJ"';
