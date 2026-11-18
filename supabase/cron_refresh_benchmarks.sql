-- ─────────────────────────────────────────────────────────────────────────────
-- Daily schedule for the `refresh-benchmarks` Edge Function.
--
-- Run ONCE in the Supabase SQL editor after:
--   1. the benchmarks migration has been applied
--   2. the function is deployed:   supabase functions deploy refresh-benchmarks --no-verify-jwt
--   3. its secrets are set:        supabase secrets set BLS_API_KEY=... REFRESH_SECRET=...
--
-- Replace the two placeholders below:
--   <PROJECT_REF>     your project ref (Settings → General), e.g. abcdefghijklmnop
--   <REFRESH_SECRET>  the same value you set as the REFRESH_SECRET function secret
--
-- BLS publishes new data about once a year (union figures in Jan/Feb, OEWS wages
-- in spring), so most runs just log 'no_change' after one or two cheap calls. Daily (not
-- weekly) because a new OEWS release takes ~5 runs to load all 52 areas —
-- the BLS API allows 500 calls/day and a full refresh needs ~260.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the secret out of the job text
select vault.create_secret('<REFRESH_SECRET>', 'refresh_benchmarks_secret');

-- Every day 06:17 UTC
select cron.schedule(
  'refresh-benchmarks-daily',
  '17 6 * * *',
  $$
  select net.http_post(
    url     := 'https://nebgfohbxsdcthvrlipm.supabase.co/functions/v1/refresh-benchmarks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'refresh_benchmarks_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Check it:   select * from cron.job;
-- History:    select * from public.benchmark_refresh_log order by started_at desc limit 20;
-- Remove:     select cron.unschedule('refresh-benchmarks-daily');
