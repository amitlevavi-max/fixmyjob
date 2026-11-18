-- Support requests sent from the app (Fix My Job menu → Support).
-- The app can only INSERT (signed in or not); nobody can read rows through the
-- public API. Read them in the Supabase dashboard / SQL editor (service role).

create table if not exists public.support_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid default auth.uid() references auth.users (id) on delete set null,
  email         text,                                   -- reply-to address (account email, or typed in when signed out)
  category      text not null
                check (category in ('incorrect_data', 'bug', 'information', 'other')),
  message       text not null
                check (char_length(btrim(message)) between 5 and 4000),
  app_version   text,
  platform      text,                                   -- e.g. "android 35"
  status        text not null default 'new'
                check (status in ('new', 'in_progress', 'answered', 'closed')),
  handled_note  text,
  handled_at    timestamptz,
  check (email is null or char_length(email) <= 320),
  check (user_id is not null or email is not null)      -- always some way to reply
);

create index if not exists support_requests_created_idx on public.support_requests (created_at desc);
create index if not exists support_requests_status_idx  on public.support_requests (status);

alter table public.support_requests enable row level security;

-- Clients may insert only these columns (status / notes stay server-side)…
revoke all on public.support_requests from anon, authenticated;
grant insert (user_id, email, category, message, app_version, platform)
  on public.support_requests to anon, authenticated;

-- …and only as themselves (or anonymously when signed out).
drop policy if exists "support: insert own" on public.support_requests;
create policy "support: insert own" on public.support_requests
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Simple flood guard: at most 10 requests per signed-in user per hour.
create or replace function public.support_requests_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (
    select count(*) from public.support_requests
    where user_id = new.user_id and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Too many support requests — please try again later.';
  end if;
  return new;
end $$;

drop trigger if exists support_requests_rate_limit on public.support_requests;
create trigger support_requests_rate_limit
  before insert on public.support_requests
  for each row execute function public.support_requests_rate_limit();

-- Weekly overview for reporting
create or replace view public.support_requests_summary
with (security_invoker = true) as
  select date_trunc('week', created_at)::date as week, category, status, count(*) as requests
  from public.support_requests
  group by 1, 2, 3
  order by 1 desc, 2, 3;
revoke all on public.support_requests_summary from anon, authenticated;
