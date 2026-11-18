/**
 * refresh-cert-pay Edge Function
 *
 * Pay of full-time employees WITH an active professional certification or
 * license vs WITHOUT, per occupation, from the Census Bureau's Current
 * Population Survey (24 most recent monthly files, Census Data API).
 * Writes public.cert_pay_gaps. Run once now, then yearly (the gaps move slowly).
 *
 *   supabase secrets set CENSUS_API_KEY=...        (free: api.census.gov/data/key_signup.html)
 *   supabase functions deploy refresh-cert-pay --no-verify-jwt
 *   POST with header x-refresh-secret: <REFRESH_SECRET>   body {} or {"months": 24}
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { addRows, gapFor, monthsBefore, Groups } from './certPay.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

const VARS = 'PTERNWA,PWORWGT,PECERT1,PTIO1OCD,PRCOW1';

serve(async (req) => {
  const secret = Deno.env.get('REFRESH_SECRET');
  if (!secret || req.headers.get('x-refresh-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  const key = Deno.env.get('CENSUS_API_KEY');
  if (!key) return json({ error: 'CENSUS_API_KEY secret is not set' }, 500);

  let body: { months?: number } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const want = Math.max(6, Math.min(36, body.months ?? 24));

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: log } = await db.from('benchmark_refresh_log').insert({ job: 'cert_pay', status: 'running' }).select('id').single();
  const finish = async (status: string, rows: number, period: string | null, detail: string | null, calls: number) => {
    if (log?.id) {
      await db.from('benchmark_refresh_log').update({
        finished_at: new Date().toISOString(), status, rows_upserted: rows, period, detail, api_calls: calls,
      }).eq('id', log.id);
    }
  };

  let calls = 0;
  try {
    // Newest months may not be published yet: look back up to want + 4 months
    const candidates = monthsBefore(new Date(), want + 4);
    const groups = new Map<string, Groups>();
    const got: string[] = [];
    let responses = 0;
    for (let i = 0; i < candidates.length && got.length < want; i += 4) {
      const batch = candidates.slice(i, Math.min(i + 4, candidates.length));
      const results = await Promise.all(batch.map(async (m) => {
        calls++;
        const url = `https://api.census.gov/data/${m.year}/cps/basic/${m.mon}?get=${VARS}&PEMLR=1&PRFTLF=1&key=${key}`;
        const r = await fetch(url);
        const text = await r.text();
        if (!r.ok || !text.startsWith('[')) {
          if (/invalid key/i.test(text)) throw new Error('Census API key is invalid or not activated yet');
          return null;                                   // month not published yet
        }
        return { m, rows: JSON.parse(text) as string[][] };
      }));
      for (const res of results) {
        if (!res || got.length >= want) continue;
        responses += addRows(groups, res.rows);
        got.push(res.m.label);
      }
    }
    if (got.length < 6) throw new Error(`only ${got.length} monthly files available`);
    got.sort();
    const period_from = got[0], period_to = got[got.length - 1];

    const { data: known } = await db.from('census_occupations').select('census_code');
    const valid = new Set((known ?? []).map((r: { census_code: string }) => r.census_code));
    const rows = [...groups.entries()]
      .filter(([code]) => valid.has(code))
      .map(([census_code, g]) => ({ census_code, ...gapFor(g), period_from, period_to, updated_at: new Date().toISOString() }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('cert_pay_gaps').upsert(rows.slice(i, i + 500), { onConflict: 'census_code' });
      if (error) throw new Error(error.message);
    }
    const reliable = rows.filter((r) => r.reliable).length;
    const period = `${period_from}..${period_to}`;
    await finish('ok', rows.length, period, `${got.length} months, ${responses} responses, ${reliable} occupations with a clear gap`, calls);
    return json({ status: 'ok', months: got.length, period, responses, occupations: rows.length, reliable });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish('error', 0, null, msg, calls);
    return json({ status: 'error', detail: msg }, 500);
  }
});
