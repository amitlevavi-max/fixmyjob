// refresh-cos-flags — sets CareerOneStop "In-Demand" / "Industry-Endorsed" flags on credentials.
//
// Started manually with `select public.start_cos_flag_refresh();` — that schedules this function every minute
// (pg_cron, header x-region: us-east-1 because careeronestop.org blocks Ireland). Each call is one batch:
// claim the run's lease, check due credentials for ~45 s, save, release. When nothing is due the run is
// marked done and the cron job removed. Due = never checked, or last checked more than 6 months ago.
//
// Auth: header x-refresh-secret must equal REFRESH_SECRET (same as the other refresh functions).
// Secrets: CAREERONESTOP_USER_ID, CAREERONESTOP_TOKEN, REFRESH_SECRET (+ built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
//
// Test without writing:  POST {"test": {"name": "Certified Welder (CW)", "issuer": "American Welding Society"}}

import { createClient } from 'npm:@supabase/supabase-js@2';
import { bracketAcronyms, findMatches, keywordFor, tagsOf, type CosCert, type Credential } from './match.ts';

const API = 'https://api.careeronestop.org/v1/certificationfinder';
const BUDGET_MS = 45_000;   // finish well inside the 1-minute cron interval
const BATCH = 12;           // records fetched per loop
const CONCURRENCY = 3;      // parallel API calls (more caused HTTP 500s in testing)

const userId = Deno.env.get('CAREERONESTOP_USER_ID') ?? '';
const token = Deno.env.get('CAREERONESTOP_TOKEN') ?? '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Keyword search. Returns [] when CareerOneStop has no results, null when the API kept failing.
async function cosSearch(keyword: string): Promise<CosCert[] | null> {
  if (!keyword) return [];
  const url = `${API}/${encodeURIComponent(userId)}/${encodeURIComponent(keyword)}/0/0/0/0/0/0/0/0/0/25`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (r.status === 404) return [];
      if (r.ok) {
        const j = await r.json();
        return (j?.CertList ?? []) as CosCert[];
      }
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  return null;
}

type Result =
  | { ok: true; certId: string | null; method: 'exact' | 'acronym' | 'not_found'; tags: string[] }
  | { ok: false; error: string };

async function check(cred: Credential): Promise<Result> {
  try {
    const keywords = [keywordFor(cred.name), ...bracketAcronyms(cred.name)];
    for (const kw of [...new Set(keywords)]) {
      const certs = await cosSearch(kw);
      if (certs === null) return { ok: false, error: `API kept failing for "${kw}"` };
      const matches = findMatches(cred, certs);
      if (matches.length) {
        const best = matches.filter((m) => m.method === matches[0].method);
        // Same credential listed more than once on CareerOneStop: a flag on any copy counts.
        const tags = [...new Set(best.flatMap((m) => tagsOf(m.cert)))];
        return { ok: true, certId: best[0].cert.Id, method: best[0].method, tags };
      }
    }
    return { ok: true, certId: null, method: 'not_found', tags: [] };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get('x-refresh-secret') !== Deno.env.get('REFRESH_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  if (!userId || !token) return Response.json({ ok: false, error: 'CAREERONESTOP_USER_ID / CAREERONESTOP_TOKEN not set' });
  const body = await req.json().catch(() => ({}));

  if (body?.test?.name) {
    const cred: Credential = { id: 'test', name: String(body.test.name), issuer: body.test.issuer ?? null };
    return Response.json({ region: Deno.env.get('SB_REGION'), result: await check(cred) });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: runId, error: claimErr } = await sb.rpc('cos_flag_claim_batch');
  if (claimErr) return Response.json({ ok: false, error: claimErr.message }, { status: 500 });
  if (!runId) return Response.json({ ok: true, skipped: 'no running run, or another batch is busy' });

  const started = Date.now();
  const t = { checked: 0, matched: 0, in_demand: 0, endorsed: 0, errors: 0 };
  let done = false;

  try {
    while (Date.now() - started < BUDGET_MS) {
      const { data: due, error } = await sb.rpc('cos_flags_due', { p_limit: BATCH });
      if (error) throw new Error(error.message);
      if (!due?.length) { done = true; break; }

      const results = await pool(due as Credential[], CONCURRENCY, check);
      const now = new Date().toISOString();
      await pool(due as Credential[], 4, async (cred) => {
        const r = results[(due as Credential[]).indexOf(cred)];
        if (r.ok) {
          const inDemand = r.tags.includes('In-Demand');
          const endorsed = r.tags.includes('IND');
          const { error: upErr } = await sb.from('credentials').update({
            cos_cert_id: r.certId,
            cos_in_demand: inDemand,
            cos_industry_endorsed: endorsed,
            cos_tags: r.tags,
            cos_match: r.method,
            cos_flags_updated_at: now,
            cos_error: null,
            cos_error_at: null,
          }).eq('id', cred.id);
          if (upErr) { t.errors++; return; }
          t.checked++;
          if (r.certId) t.matched++;
          if (inDemand) t.in_demand++;
          if (endorsed) t.endorsed++;
        } else {
          t.errors++;
          await sb.from('credentials').update({ cos_error: r.error, cos_error_at: now }).eq('id', cred.id);
        }
      });
    }
  } catch (e) {
    await sb.rpc('cos_flag_progress', { p_run: runId, p_checked: t.checked, p_matched: t.matched,
      p_in_demand: t.in_demand, p_endorsed: t.endorsed, p_errors: t.errors + 1, p_release: true });
    return Response.json({ ok: false, run: runId, error: String((e as Error)?.message ?? e), ...t }, { status: 500 });
  }

  await sb.rpc('cos_flag_progress', { p_run: runId, p_checked: t.checked, p_matched: t.matched,
    p_in_demand: t.in_demand, p_endorsed: t.endorsed, p_errors: t.errors, p_release: true });
  if (done) await sb.rpc('cos_flag_finish', { p_run: runId });

  return Response.json({ ok: true, run: runId, done, seconds: Math.round((Date.now() - started) / 1000), ...t });
});
