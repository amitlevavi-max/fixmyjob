-- Several goals per user (2026-10-15).
-- goals: [{ "id": "earn_more", "importance": 1, "addedAt": "...", "satisfaction": 3 }, ...]
--   importance 1 = the goal the user is focusing on; the others keep their order.
--   Improvement potential is not stored — the app works it out from sourced
--   pay data and the suggestions linked to each goal.
-- The old `goal` and `satisfaction` columns are kept and always hold the focus goal.
alter table public.user_profiles
  add column if not exists goals jsonb;

-- Existing users: their one goal becomes their focus goal
update public.user_profiles
set goals = jsonb_build_array(jsonb_build_object(
  'id', goal,
  'importance', 1,
  'addedAt', coalesce(updated_at, now()),
  'satisfaction', satisfaction))
where goals is null and goal is not null;
