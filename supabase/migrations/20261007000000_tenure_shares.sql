-- ─────────────────────────────────────────────────────────────────────────────
-- Limited-launch additions
--   user_profiles.tenure_months  exact time in current job (under 5 years)
--   share_events                 who shared what, where — to measure virality
--   log_share(...)               the only way the app writes share_events
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles add column if not exists tenure_months integer
  check (tenure_months is null or tenure_months between 0 and 600);

create table if not exists public.share_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  screen      text not null,            -- 'earnings_rank' | 'share' | …
  channel     text not null,            -- 'whatsapp' | 'messenger' | 'x' | 'instagram' | 'other'
  ref_code    text                      -- code in the shared link (to credit sign-ups later)
);
create index if not exists share_events_created on public.share_events (created_at desc);
alter table public.share_events enable row level security;   -- no policies: write via log_share only

create or replace function public.log_share(p_screen text, p_channel text, p_ref text default null)
returns void
language sql security definer
set search_path = public
as $$
  insert into share_events (user_id, screen, channel, ref_code)
  values (auth.uid(), left(p_screen, 40), left(p_channel, 20), left(p_ref, 20));
$$;
grant execute on function public.log_share(text, text, text) to anon, authenticated;

-- Quick look: shares per day and channel
create or replace view public.share_summary with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, screen, channel, count(*) as shares
  from public.share_events group by 1, 2, 3;
revoke all on public.share_summary from anon, authenticated;
