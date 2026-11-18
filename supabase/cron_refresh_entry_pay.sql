-- ─────────────────────────────────────────────────────────────────────────────
-- Monthly schedule for the `refresh-entry-pay` Edge Function.
--
-- Run ONCE in the Supabase SQL editor after:
--   1. npx supabase db push              (migration 20261019000000_career_paths.sql)
--   2. npx supabase functions deploy refresh-entry-pay --no-verify-jwt
-- It reuses the vault secret `refresh_benchmarks_secret` created by
-- cron_refresh_benchmarks.sql (same REFRESH_SECRET), so nothing to replace.
--
-- Sources change rarely (PSEO about twice a year, the CPS January supplement
-- every two years, DOL training results when re-imported), so monthly is plenty.
-- Two runs on different days keep each call inside the function time limit.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'refresh-entry-pay-monthly',
  '41 6 3 * *',                              -- 3rd of each month, 06:41 UTC: PSEO + ETA + CPS new entrants
  $$
  select net.http_post(
    url     := 'https://nebgfohbxsdcthvrlipm.supabase.co/functions/v1/refresh-entry-pay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'refresh_benchmarks_secret')
    ),
    body    := '{"job":"all"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

select cron.schedule(
  'refresh-entry-pay-young-monthly',
  '41 6 4 * *',                              -- 4th of each month: CPS young full-time workers (fallback)
  $$
  select net.http_post(
    url     := 'https://nebgfohbxsdcthvrlipm.supabase.co/functions/v1/refresh-entry-pay',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'refresh_benchmarks_secret')
    ),
    body    := '{"job":"cps_young"}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);

-- Check:  select * from cron.job where jobname like 'refresh-entry-pay%';
--         select * from benchmark_refresh_log where job like 'entry_pay%' order by started_at desc limit 10;
