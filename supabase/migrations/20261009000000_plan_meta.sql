-- Per-opportunity details for My plan: usefulness rating, "not for me" reason,
-- first seen / decided dates and the steps the user checked off.
-- { "<opportunity id>": { "rating": "very", "reason": "...", "firstSeen": "...", "decidedAt": "...", "stepsDone": [0,2] } }
alter table public.user_profiles add column if not exists opportunity_meta jsonb;
