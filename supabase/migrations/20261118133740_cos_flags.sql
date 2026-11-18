-- CareerOneStop flags on credentials: "In-Demand" and "Industry-Endorsed".
-- Filled by the Edge Function refresh-cos-flags (CareerOneStop Certification Finder API, called from us-east-1).
-- Scope: credentials of kind certification or badge (licences and apprenticeships are not in the Certification Finder).
-- A record is due when it was never checked or was last checked more than 6 months ago.
-- Start manually:  select public.start_cos_flag_refresh();     Stop:  select public.stop_cos_flag_refresh();
-- Progress:        select * from public.cos_flag_runs order by id desc limit 1;
--
-- Revert:
--   select cron.unschedule('cos-flag-refresh') where exists (select 1 from cron.job where jobname = 'cos-flag-refresh');
--   drop function if exists public.start_cos_flag_refresh(), public.stop_cos_flag_refresh(), public.cos_flag_claim_batch(),
--     public.cos_flag_progress(bigint,int,int,int,int,int,boolean), public.cos_flag_finish(bigint), public.cos_flags_due(int);
--   drop table if exists public.cos_flag_runs;
--   alter table public.credentials drop column if exists cos_cert_id, drop column if exists cos_in_demand,
--     drop column if exists cos_industry_endorsed, drop column if exists cos_tags, drop column if exists cos_match,
--     drop column if exists cos_flags_updated_at, drop column if exists cos_error, drop column if exists cos_error_at;

alter table public.credentials
  add column if not exists cos_cert_id text,                 -- CareerOneStop certification id, e.g. 3779-A (null when not found)
  add column if not exists cos_in_demand boolean,            -- tagged "In-Demand" (frequently mentioned in online job postings)
  add column if not exists cos_industry_endorsed boolean,    -- tagged "IND" (third-party industry-endorsed)
  add column if not exists cos_tags text[],                  -- all CareerOneStop tags (In-Demand, IND, NCCA, ANAB, MILITARY, ...)
  add column if not exists cos_match text,                   -- exact | acronym | not_found
  add column if not exists cos_flags_updated_at timestamptz, -- last successful check; null = never checked
  add column if not exists cos_error text,                   -- last API error (kept until the next successful check)
  add column if not exists cos_error_at timestamptz;

create index if not exists credentials_cos_due_idx
  on public.credentials (cos_flags_updated_at nulls first, id)
  where kind in ('certification', 'badge');

create table if not exists public.cos_flag_runs (
  id            bigserial primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running',   -- running | done | stopped
  checked       int not null default 0,            -- records checked successfully
  matched       int not null default 0,            -- found on CareerOneStop
  in_demand     int not null default 0,
  endorsed      int not null default 0,
  errors        int not null default 0,            -- API failures after retries (retried in a later batch/run)
  batches       int not null default 0,
  last_batch_at timestamptz                        -- lease: one batch at a time
);
alter table public.cos_flag_runs enable row level security;  -- no policies: service role / SQL editor only

-- Records due for a check (never checked, or checked > 6 months ago). Records that failed in the last hour are skipped,
-- so a run can finish; they are picked up by the next run.
create or replace function public.cos_flags_due(p_limit int)
returns table (id text, name text, issuer text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.issuer
  from credentials c
  where c.kind in ('certification', 'badge')
    and (c.cos_flags_updated_at is null or c.cos_flags_updated_at < now() - interval '6 months')
    and (c.cos_error_at is null or c.cos_error_at < now() - interval '1 hour')
  order by c.cos_flags_updated_at nulls first, c.id
  limit p_limit
$$;

-- Lease for one batch of the running run; returns the run id, or null if no run is active or a batch is still busy.
create or replace function public.cos_flag_claim_batch()
returns bigint
language sql security definer set search_path = public as $$
  update cos_flag_runs set last_batch_at = now(), batches = batches + 1
  where id = (select r.id from cos_flag_runs r where r.status = 'running' order by r.id desc limit 1)
    and (last_batch_at is null or last_batch_at < now() - interval '3 minutes')
  returning id
$$;

create or replace function public.cos_flag_progress(p_run bigint, p_checked int, p_matched int, p_in_demand int,
                                                    p_endorsed int, p_errors int, p_release boolean)
returns void
language sql security definer set search_path = public as $$
  update cos_flag_runs
  set checked = checked + p_checked, matched = matched + p_matched, in_demand = in_demand + p_in_demand,
      endorsed = endorsed + p_endorsed, errors = errors + p_errors,
      last_batch_at = case when p_release then null else last_batch_at end
  where id = p_run
$$;

create or replace function public.cos_flag_finish(p_run bigint)
returns void
language plpgsql security definer set search_path = public, cron as $$
begin
  update cos_flag_runs set status = 'done', finished_at = now(), last_batch_at = null
  where id = p_run and status = 'running';
  if exists (select 1 from cron.job where jobname = 'cos-flag-refresh') then
    perform cron.unschedule('cos-flag-refresh');
  end if;
end $$;

-- Manual trigger: starts a run (or returns the one already running) and schedules a batch every minute
-- until nothing is due. The Edge Function unschedules the job when the run is done.
create or replace function public.start_cos_flag_refresh()
returns bigint
language plpgsql security definer set search_path = public, cron, extensions as $$
declare
  v_run bigint;
begin
  select id into v_run from cos_flag_runs where status = 'running' order by id desc limit 1;
  if v_run is null then
    insert into cos_flag_runs default values returning id into v_run;
  end if;
  perform cron.schedule('cos-flag-refresh', '* * * * *', $job$
    select net.http_post(
      url := 'https://nebgfohbxsdcthvrlipm.supabase.co/functions/v1/refresh-cos-flags',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-region', 'us-east-1',
        'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'refresh_benchmarks_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000)
  $job$);
  return v_run;
end $$;

create or replace function public.stop_cos_flag_refresh()
returns void
language plpgsql security definer set search_path = public, cron as $$
begin
  update cos_flag_runs set status = 'stopped', finished_at = now(), last_batch_at = null where status = 'running';
  if exists (select 1 from cron.job where jobname = 'cos-flag-refresh') then
    perform cron.unschedule('cos-flag-refresh');
  end if;
end $$;

revoke all on function public.cos_flags_due(int), public.cos_flag_claim_batch(),
  public.cos_flag_progress(bigint,int,int,int,int,int,boolean), public.cos_flag_finish(bigint),
  public.start_cos_flag_refresh(), public.stop_cos_flag_refresh()
  from public, anon, authenticated;
grant execute on function public.cos_flags_due(int), public.cos_flag_claim_batch(),
  public.cos_flag_progress(bigint,int,int,int,int,int,boolean), public.cos_flag_finish(bigint)
  to service_role;
