-- Account deletion requests submitted from the public web page (fixmyjob website /delete-account).
-- Written only by the Edge Function `request-account-deletion` (service role). No public access.

create table if not exists public.account_deletion_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  email            text not null,
  reason           text,
  comment          text,
  delete_scope     text not null default 'account'          -- 'account' (everything) | 'data_only' (keep sign-in, clear answers)
                   check (delete_scope in ('account', 'data_only')),
  matched_user_id  uuid,                                     -- auth.users id with that email, if one exists
  status           text not null default 'new'
                   check (status in ('new', 'verified', 'completed', 'rejected')),
  completed_at     timestamptz,
  handled_note     text,
  email_sent       boolean not null default false,           -- notification email to the team went out
  ip_hash          text,                                     -- sha256(ip + salt), only for rate limiting
  user_agent       text
);

create index if not exists account_deletion_requests_created_idx on public.account_deletion_requests (created_at desc);
create index if not exists account_deletion_requests_status_idx  on public.account_deletion_requests (status);
create index if not exists account_deletion_requests_ip_idx      on public.account_deletion_requests (ip_hash, created_at);

-- RLS on, no policies: anon / authenticated clients can neither read nor write. Service role bypasses RLS.
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;

-- Lets the Edge Function link a request to an existing account without listing all users.
create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;
revoke all on function public.lookup_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.lookup_user_id_by_email(text) to service_role;

-- Reporting view (service role / SQL editor only).
create or replace view public.account_deletion_requests_summary
with (security_invoker = true) as
select
  date_trunc('week', created_at)::date                       as week,
  count(*)                                                   as requests,
  count(*) filter (where matched_user_id is not null)        as matched_accounts,
  count(*) filter (where status = 'completed')               as completed,
  count(*) filter (where status = 'new')                     as open,
  count(*) filter (where delete_scope = 'data_only')         as data_only
from public.account_deletion_requests
group by 1
order by 1 desc;
revoke all on public.account_deletion_requests_summary from anon, authenticated;
