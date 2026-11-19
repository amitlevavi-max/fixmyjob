// refresh-cos-flags — CareerOneStop "In-Demand" / "Industry-Endorsed" certifications.
//
// Started with `select public.start_cos_flag_refresh();` (manually, or monthly by pg_cron job cos-flag-monthly).
// That schedules this function every minute (header x-region: us-east-1 — careeronestop.org blocks Ireland).
// Each call is one ~45 s batch of the run's current phase; the run moves on by itself:
//
//   flags     credentials (certification/badge) never checked or checked > 6 months ago: search CareerOneStop
//             by name, accept a match only when the issuer agrees (match.ts), store the tags
//   discover  every occupation (table occupations, 6-digit SOC): list its certifications, keep the flagged ones
//             in cos_catalog with the occupations they are listed under
//   promote   cos_promote(): a flagged catalog certification without a record gets one only when courses name it
//             (links in course_credentials) — no course, no record (guiding rule: effort + upside or no suggestion)
//   link      cos_link_courses(): the same course links for flagged credentials from Credential Engine
//   → done    the run is marked done and the every-minute job removed
//
// Auth: header x-refresh-secret must equal REFRESH_SECRET (same as the other refresh functions).
// Secrets: CAREERONESTOP_USER_ID, CAREERONESTOP_TOKEN, REFRESH_SECRET (+ built-in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
//
// Test without writing:  POST {"test": {"name": "Certified Welder (CW)", "issuer": "American Welding Society"}}

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { bracketAcronyms, findMatches, keywordFor, tagsOf, type CosCert, type Credential } from './match.ts';

const API = 'https://api.careeronestop.org/v1/certificationfinder';
const BUDGET_MS = 45_000;   // finish well inside the 1-minute cron interval
const BATCH = 12;           // credentials per loop (flags phase)
const SOCS_PER_LOOP = 6;    // occupations per loop (discover phase)
const CONCURRENCY = 3;      // parallel API calls (more caused HTTP 500s in testing)
const FLAG_TAGS = ['In-Demand', 'IND'];

const userId = Deno.env.get('CAREERONESTOP_USER_ID') ?? '';
const token = Deno.env.get('CAREERONESTOP_TOKEN') ?? '';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET with 3 tries on 5xx / 429 / network errors. [] when CareerOneStop has no results, null when it kept failing. */
async function cosList(path: string): Promise<CosCert[] | null> {
  const url = `${API}/${encodeURIComponent(userId)}/${path}`;
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

/** Keyword search (flags phase) */
const cosSearch = (keyword: string) =>
  keyword ? cosList(`${encodeURIComponent(keyword)}/0/0/0/0/0/0/0/0/0/25`) : Promise.resolve([] as CosCert[]);

/** Certifications listed under one occupation (6-digit SOC works; the ".00" O*NET form fails for some jobs) */
const cosByOccupation = (soc: string) => cosList(`${encodeURIComponent(soc)}/D/0/0/0/0/0/0/0/0/1000`);

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

type Totals = { checked: number; matched: number; in_demand: number; endorsed: number; errors: number;
                discovered: number; promoted: number; linked: number };

/** One loop of the flags phase. Returns false when nothing is due. */
async function flagsLoop(sb: SupabaseClient, t: Totals): Promise<boolean> {
  const { data: due, error } = await sb.rpc('cos_flags_due', { p_limit: BATCH });
  if (error) throw new Error(error.message);
  if (!due?.length) return false;
  const creds = due as Credential[];
  const results = await pool(creds, CONCURRENCY, check);
  const now = new Date().toISOString();
  await pool(creds.map((c, i) => [c, results[i]] as const), 4, async ([cred, r]) => {
    if (r.ok) {
      const inDemand = r.tags.includes('In-Demand');
      const endorsed = r.tags.includes('IND');
      const { error: upErr } = await sb.from('credentials').update({
        cos_cert_id: r.certId, cos_in_demand: inDemand, cos_industry_endorsed: endorsed, cos_tags: r.tags,
        cos_match: r.method, cos_flags_updated_at: now, cos_error: null, cos_error_at: null,
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
  return true;
}

/** One loop of the discover phase. Returns the next cursor. */
async function discoverLoop(sb: SupabaseClient, socs: string[], cursor: number, t: Totals): Promise<number> {
  const slice = socs.slice(cursor, cursor + SOCS_PER_LOOP);
  const lists = await pool(slice, CONCURRENCY, async (soc) => {
    try { return { soc, certs: await cosByOccupation(soc) }; } catch { return { soc, certs: null }; }
  });
  const rows: Record<string, unknown>[] = [];
  for (const { soc, certs } of lists) {
    if (certs === null) { t.errors++; continue; }   // this occupation is retried in next month's run
    for (const c of certs) {
      const tags = tagsOf(c);
      if (!tags.some((x) => FLAG_TAGS.includes(x))) continue;
      const anyC = c as CosCert & Record<string, any>;
      rows.push({
        cert_id: c.Id, name: c.Name, acronym: c.Acronym ?? null, org: c.Organization ?? null,
        org_url: anyC.OrganizationUrl ?? null, url: anyC.Url ?? null,
        description: typeof anyC.Description === 'string' ? anyC.Description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : null,
        cert_type: anyC.Type ?? null, tags, soc,
      });
    }
  }
  if (rows.length) {
    const { error } = await sb.rpc('cos_catalog_upsert', { p_rows: rows });
    if (error) throw new Error(`cos_catalog_upsert: ${error.message}`);
    t.discovered += rows.length;
  }
  return cursor + slice.length;
}

/** cos_promote / cos_link_courses with a smaller batch after a statement timeout */
async function sqlStep(sb: SupabaseClient, fn: 'cos_promote' | 'cos_link_courses', size: { n: number }) {
  for (;;) {
    const { data, error } = await sb.rpc(fn, { p_limit: size.n });
    if (!error) return data as { remaining: number; with_courses?: number; links?: number };
    if (/timeout|canceling statement/i.test(error.message) && size.n > 1) { size.n = Math.max(1, Math.floor(size.n / 2)); continue; }
    throw new Error(`${fn}: ${error.message}`);
  }
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

  const { data: run, error: runErr } = await sb.from('cos_flag_runs').select('phase, soc_cursor').eq('id', runId).single();
  if (runErr || !run) return Response.json({ ok: false, error: runErr?.message ?? 'run not found' }, { status: 500 });

  const started = Date.now();
  const t: Totals = { checked: 0, matched: 0, in_demand: 0, endorsed: 0, errors: 0, discovered: 0, promoted: 0, linked: 0 };
  let phase: string = run.phase;
  let cursor: number = run.soc_cursor;
  let socs: string[] | null = null;
  const size = { n: 4 };
  let done = false;

  const save = async (release: boolean) => {
    await sb.rpc('cos_flag_progress', { p_run: runId, p_checked: t.checked, p_matched: t.matched,
      p_in_demand: t.in_demand, p_endorsed: t.endorsed, p_errors: t.errors, p_release: release });
    await sb.rpc('cos_flag_phase', { p_run: runId, p_phase: phase, p_cursor: cursor,
      p_discovered: t.discovered, p_promoted: t.promoted, p_linked: t.linked });
  };

  try {
    while (!done && Date.now() - started < BUDGET_MS) {
      if (phase === 'flags') {
        if (!(await flagsLoop(sb, t))) {
          phase = 'discover'; cursor = 0;
          const { error } = await sb.rpc('cos_catalog_begin');
          if (error) throw new Error(`cos_catalog_begin: ${error.message}`);
        }
      } else if (phase === 'discover') {
        if (!socs) {
          const { data, error } = await sb.from('occupations').select('soc').order('soc');
          if (error) throw new Error(`occupations: ${error.message}`);
          socs = (data ?? []).map((x: { soc: string }) => x.soc).filter((s) => /^\d{2}-\d{4}$/.test(s));
        }
        if (cursor >= socs.length) {
          const { error } = await sb.rpc('cos_catalog_end');
          if (error) throw new Error(`cos_catalog_end: ${error.message}`);
          phase = 'promote';
        } else {
          cursor = await discoverLoop(sb, socs, cursor, t);
        }
      } else if (phase === 'promote') {
        const r = await sqlStep(sb, 'cos_promote', size);
        t.promoted += r.with_courses ?? 0;
        if (!r.remaining) { phase = 'link'; size.n = 4; }
      } else if (phase === 'link') {
        const r = await sqlStep(sb, 'cos_link_courses', size);
        t.linked += r.links ?? 0;
        if (!r.remaining) { phase = 'done'; done = true; }
      } else {
        done = true;
      }
    }
  } catch (e) {
    t.errors++;
    await save(true);
    return Response.json({ ok: false, run: runId, phase, error: String((e as Error)?.message ?? e), ...t }, { status: 500 });
  }

  await save(true);
  if (done) await sb.rpc('cos_flag_finish', { p_run: runId });
  return Response.json({ ok: true, run: runId, phase, done, seconds: Math.round((Date.now() - started) / 1000), ...t });
});
