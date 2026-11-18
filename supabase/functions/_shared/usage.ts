/**
 * Logs what one Anthropic call used (Amit, 2026-10-28), so a cost spike can be
 * traced to the feature that caused it. One row per call in `ai_usage_log`;
 * see the `ai_usage_daily` view for totals per day, function and model.
 * Never throws: a failed log must not break the feature.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function logUsage(fn: string, requestedModel: string, data: any, meta?: Record<string, unknown>) {
  try {
    const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    const u = data?.usage ?? {};
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await db.from('ai_usage_log').insert({
      function_name: fn,
      model: data?.model ?? requestedModel,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      web_searches: u.server_tool_use?.web_search_requests ?? 0,
      stop_reason: data?.stop_reason ?? null,
      meta: meta ?? null,
    });
    if (error) console.error('usage log failed', error.message);
  } catch (e) {
    console.error('usage log failed', e);
  }
}
