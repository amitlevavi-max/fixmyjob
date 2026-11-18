-- One row per Anthropic API call made by an Edge Function (Amit, 2026-10-28),
-- so the next cost spike shows which feature caused it.
create table if not exists public.ai_usage_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  function_name text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  web_searches integer not null default 0,
  stop_reason text,
  meta jsonb
);
create index if not exists ai_usage_log_created_idx on public.ai_usage_log (created_at desc);
create index if not exists ai_usage_log_fn_idx on public.ai_usage_log (function_name, created_at desc);

-- Only the Edge Functions (service role) write or read it; the app's public key can't.
alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from anon, authenticated;

-- Totals per day, function and model, with an estimated cost in USD
-- (list prices, Oct 2026: Sonnet 4.5 $3/$15, Haiku 4.5 $1/$5 per million tokens in/out,
--  cache reads 0.1x input, cache writes 1.25x input, web search $10 per 1,000).
create or replace view public.ai_usage_daily with (security_invoker = on) as
select
  date_trunc('day', created_at)::date as day,
  function_name,
  model,
  count(*) as calls,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  sum(web_searches) as web_searches,
  round(sum(input_tokens)::numeric / nullif(count(*), 0)) as avg_input_per_call,
  round((
    sum(input_tokens) * p.inp + sum(output_tokens) * p.outp
    + sum(cache_read_tokens) * p.inp * 0.1 + sum(cache_write_tokens) * p.inp * 1.25
  ) / 1e6 + sum(web_searches) * 0.01, 2) as est_cost_usd
from public.ai_usage_log
cross join lateral (
  select case when model ilike '%haiku%' then 1.0 when model ilike '%opus%' then 5.0 else 3.0 end as inp,
         case when model ilike '%haiku%' then 5.0 when model ilike '%opus%' then 25.0 else 15.0 end as outp
) p
group by 1, 2, 3, p.inp, p.outp
order by 1 desc, est_cost_usd desc;
revoke all on public.ai_usage_daily from anon, authenticated;
