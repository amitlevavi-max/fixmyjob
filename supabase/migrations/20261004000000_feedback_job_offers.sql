-- ─────────────────────────────────────────────────────────────────────────────
-- Advice feedback + job-offer opt-in
--
--   advice_feedback        one row per "Was this helpful?" answer
--   submit_advice_feedback the only way the app writes it (records who, from
--                          the login, plus their goal/occupation for analysis)
--   user_profiles          + wants_job_offers / job_offer_email / opted-in time
--
-- Nobody can read feedback through the app; view it in the Supabase dashboard
-- (Table editor → advice_feedback) or with the summary view below.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.advice_feedback (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  user_id           uuid references auth.users(id) on delete set null,
  opportunity_id    text not null,
  opportunity_title text,
  rating            smallint not null check (rating between 1 and 5),
  comment           text check (char_length(comment) <= 2000),
  goal              text,
  occupation_soc    text,
  location_state    text
);
create index if not exists advice_feedback_opportunity on public.advice_feedback (opportunity_id, created_at desc);

alter table public.advice_feedback enable row level security;
-- No policies: the app cannot read or write the table directly.

create or replace function public.submit_advice_feedback(
  p_opportunity_id text,
  p_opportunity_title text,
  p_rating int,
  p_comment text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_goal text;
  v_soc text;
  v_state text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be 1–5';
  end if;
  if uid is not null then
    select goal, occupation_soc, location_state into v_goal, v_soc, v_state from public.user_profiles where id = uid;
  end if;
  insert into public.advice_feedback
    (user_id, opportunity_id, opportunity_title, rating, comment, goal, occupation_soc, location_state)
  values
    (uid, left(p_opportunity_id, 100), left(p_opportunity_title, 200), p_rating,
     nullif(left(trim(coalesce(p_comment, '')), 2000), ''),
     v_goal, v_soc, v_state);
end;
$$;

grant execute on function public.submit_advice_feedback(text, text, int, text) to anon, authenticated;

-- Quick look: average rating per opportunity
create or replace view public.advice_feedback_summary
with (security_invoker = true) as
  select opportunity_id,
         max(opportunity_title) as opportunity_title,
         count(*)               as responses,
         round(avg(rating), 2)  as avg_rating,
         count(comment)         as comments,
         max(created_at)        as last_response
  from public.advice_feedback
  group by opportunity_id;
revoke all on public.advice_feedback_summary from anon, authenticated;

-- ── Job-offer opt-in on the profile ─────────────────────────────────────────
alter table public.user_profiles
  add column if not exists wants_job_offers     boolean,
  add column if not exists job_offer_email      text,
  add column if not exists job_offers_opted_at  timestamptz;
