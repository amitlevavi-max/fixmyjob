-- ─────────────────────────────────────────────────────────────────────────────
-- Switch the benchmarks refresh from daily to hourly.
-- Run ONCE in the Supabase SQL editor (after `npx supabase db push` and
-- redeploying refresh-benchmarks). Reuses the secret already in the vault.
--
-- Why hourly: each run can make ~45 BLS calls before the function's time
-- limit; hourly runs use up to 450 of the 500 calls/day allowed. The function
-- counts calls and pauses itself at the daily budget, and once everything is
-- loaded a run makes at most one cheap check call.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the old daily job (ignore the error if it was already removed)
select cron.unschedule('refresh-benchmarks-daily');

-- Every hour at minute 17
select cron.schedule(
  'refresh-benchmarks-hourly',
  '17 * * * *',
  $$
  select net.http_post(
    url     := 'https://nebgfohbxsdcthvrlipm.supabase.co/functions/v1/refresh-benchmarks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'refresh_benchmarks_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Check it:     select jobname, schedule, active from cron.job;
-- Progress:     select started_at, job, status, api_calls, rows_upserted, detail
--               from public.benchmark_refresh_log order by started_at desc limit 24;
-- Calls (24 h): select sum(api_calls) from public.benchmark_refresh_log
--               where started_at > now() - interval '24 hours';
-- Remove:       select cron.unschedule('refresh-benchmarks-hourly');
