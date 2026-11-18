/**
 * refresh-entry-pay Edge Function
 *
 * Entry-level pay per occupation (first year or two in the job) from official
 * data — see entryPay.ts for the four sources. Writes public.occupation_entry_pay;
 * the app reads it through public.entry_pay(soc, state).
 *
 *   supabase functions deploy refresh-entry-pay --no-verify-jwt
 *   secrets used: CENSUS_API_KEY, BLS_API_KEY, REFRESH_SECRET, CONTACT_EMAIL (all set already)
 *   POST with header x-refresh-secret: <REFRESH_SECRET>, body:
 *     {}                       or {"job":"all"}: pseo + eta + cps_new
 *     {"job":"pseo"} | {"job":"eta"} | {"job":"cps_new"} | {"job":"cps_young"}
 * Scheduled monthly by supabase/cron_refresh_entry_pay.sql (sources change a few
 * times a year at most; each run replaces that method's rows).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { makeSocMapper } from '../refresh-benchmarks/parseOccupations.ts';
import {
  addCpsRows, censusCodeFor, cipSocMap, cpiFactors, cpsEntryRows, etaEntryRows, isNewEntrant,
  isYoungNotInSchool, Obs, parseCpi, pseoAccumulator, pseoEntryRows, CensusOcc, CipSocShare, EntryRow, EtaProgram,
} from './entryPay.ts';

const PSEO_URL = 'https://lehd.ces.census.gov/data/pseo/latest_release/all/pseoe_all.csv.gz';
const PSEO_VERSION_URL = 'https://lehd.ces.census.gov/data/pseo/latest_release/all/version_pseo.txt';
// PSEO earnings are in constant dollars of this year (data notice, Feb 2026: "adjusted to 2023 dollars using CPI-U")
const PSEO_DOLLAR_YEAR = Number(Deno.env.get('PSEO_DOLLAR_YEAR') ?? '2023');
const ETA_MIN_YEAR_BACK = 6;                       // ETA-9171 reports older than this are skipped
const CPS_SUPPLEMENT_YEARS = [2020, 2022, 2024, 2026, 2028, 2030];   // January, every 2 years
const CPS_YOUNG_MONTHS = 24;
const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });
const userAgent = () => `FixMyJob-entry-pay/1.0 (contact: ${Deno.env.get('CONTACT_EMAIL') ?? 'unknown'})`;

type Outcome = { status: 'ok' | 'error'; rows?: number; period?: string; detail?: string; [k: string]: unknown };

serve(async (req) => {
  const secret = Deno.env.get('REFRESH_SECRET');
  if (!secret || req.headers.get('x-refresh-secret') !== secret) return json({ error: 'unauthorized' }, 401);
  let body: { job?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const job = body.job ?? 'all';

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const cpi = await loadCpi();
  const result: Record<string, Outcome> = {};
  if (job === 'all' || job === 'pseo') result.pseo = await run(db, 'entry_pay_pseo', () => refreshPseo(db, cpi));
  if (job === 'all' || job === 'eta') result.eta = await run(db, 'entry_pay_eta', () => refreshEta(db, cpi));
  if (job === 'all' || job === 'cps_new') result.cps_new = await run(db, 'entry_pay_cps_new', () => refreshCpsNew(db, cpi));
  if (job === 'cps_young') result.cps_young = await run(db, 'entry_pay_cps_young', () => refreshCpsYoung(db, cpi));
  if (!Object.keys(result).length) return json({ error: `unknown job ${job}` }, 400);
  return json(result, Object.values(result).some((r) => r.status === 'error') ? 500 : 200);
});

async function run(db: SupabaseClient, job: string, fn: () => Promise<Outcome>): Promise<Outcome> {
  const { data: log } = await db.from('benchmark_refresh_log').insert({ job, status: 'running' }).select('id').single();
  let out: Outcome;
  try { out = await fn(); } catch (e) { out = { status: 'error', detail: e instanceof Error ? e.message : String(e) }; }
  if (log?.id) {
    await db.from('benchmark_refresh_log').update({
      finished_at: new Date().toISOString(), status: out.status, rows_upserted: out.rows ?? 0,
      period: out.period ?? null, detail: out.detail ?? null,
    }).eq('id', log.id);
  }
  return out;
}

// ── Shared helpers ──────────────────────────────────────────────────────────

type Cpi = ReturnType<typeof cpiFactors>;

async function loadCpi(): Promise<Cpi> {
  const now = new Date().getUTCFullYear();
  const res = await fetch(BLS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent() },
    body: JSON.stringify({
      seriesid: ['CUUR0000SA0'], startyear: String(now - 12), endyear: String(now),
      annualaverage: true, registrationkey: Deno.env.get('BLS_API_KEY'),
    }),
  });
  const annual = parseCpi(await res.json());
  if (annual.size < 5) throw new Error('could not load CPI-U annual averages from BLS');
  return cpiFactors(annual);
}

async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function oewsMapper(db: SupabaseClient) {
  const socs = (await selectAll<{ soc: string }>((f, t) => db.from('occupations').select('soc').order('soc').range(f, t)))
    .map((r) => r.soc);
  if (!socs.length) throw new Error('occupations table is empty');
  return { socs, toOews: makeSocMapper(socs) };
}

/** Replace all rows of one method (rows that no longer qualify disappear). */
async function replaceMethod(db: SupabaseClient, method: string, rows: EntryRow[]) {
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from('occupation_entry_pay')
      .upsert(rows.slice(i, i + 1000).map((r) => ({ ...r, updated_at: now })), { onConflict: 'soc,area_code,method' });
    if (error) throw new Error(`occupation_entry_pay: ${error.message}`);
  }
  const { error } = await db.from('occupation_entry_pay').delete().eq('method', method).lt('updated_at', now);
  if (error) throw new Error(`occupation_entry_pay cleanup: ${error.message}`);
}

// ── 1. Census PSEO: graduates' first-year earnings ──────────────────────────

async function refreshPseo(db: SupabaseClient, cpi: Cpi): Promise<Outcome> {
  const { toOews } = await oewsMapper(db);
  const { data: shares, error } = await db.rpc('cip_soc_shares');
  if (error) throw new Error(`cip_soc_shares: ${error.message}`);
  const map = cipSocMap((shares ?? []) as CipSocShare[]);
  if (map.size < 50) throw new Error(`only ${map.size} program types mapped to occupations — is training_programs loaded?`);

  const res = await fetch(PSEO_URL, { headers: { 'User-Agent': userAgent() } });
  if (!res.ok || !res.body) throw new Error(`PSEO download: HTTP ${res.status}`);
  const acc = pseoAccumulator();
  const text = res.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream());
  let rest = '';
  for await (const chunk of text) {
    const lines = (rest + chunk).split('\n');
    rest = lines.pop() ?? '';
    for (const l of lines) acc.add(l.replace(/\r$/, ''));
  }
  if (rest) acc.add(rest);
  if (acc.lines() < 100000) throw new Error(`PSEO file looks short (${acc.lines()} lines) — nothing written`);

  const factor = cpi.factor(PSEO_DOLLAR_YEAR);
  if (!factor) throw new Error(`no CPI for ${PSEO_DOLLAR_YEAR}`);
  const rows = pseoEntryRows(acc.rows(), map, toOews, factor, cpi.target);
  if (rows.length < 50) throw new Error(`only ${rows.length} PSEO rows — nothing written`);
  await replaceMethod(db, 'graduates_pseo', rows);
  const version = await fetch(PSEO_VERSION_URL, { headers: { 'User-Agent': userAgent() } })
    .then((r) => r.text()).then((t) => (t.match(/V[\d.]+ \d{4}Q\d/) ?? [''])[0]).catch(() => '');
  const occs = new Set(rows.map((r) => r.soc)).size;
  return {
    status: 'ok', rows: rows.length, period: `PSEO ${version} (${PSEO_DOLLAR_YEAR}$ → ${cpi.target}$)`,
    occupations: occs, stateRows: rows.filter((r) => r.area_code !== 'US').length,
  };
}

// ── 2. DOL ETA-9171: training-program results ───────────────────────────────

async function refreshEta(db: SupabaseClient, cpi: Cpi): Promise<Outcome> {
  const { toOews } = await oewsMapper(db);
  const programs = await selectAll<EtaProgram>((f, t) => db.from('training_programs')
    .select('socs, state, median_q2_earnings, exited, employed_q2_rate, reported_at')
    .not('median_q2_earnings', 'is', null).order('id').range(f, t));
  const minYear = cpi.target - ETA_MIN_YEAR_BACK + 1;
  const rows = etaEntryRows(programs, toOews, cpi.factor, cpi.target, minYear);
  if (rows.length < 50) throw new Error(`only ${rows.length} ETA rows from ${programs.length} programs — nothing written`);
  await replaceMethod(db, 'graduates_eta', rows);
  return {
    status: 'ok', rows: rows.length, period: `ETA-9171 reported ${minYear}+ (→ ${cpi.target}$)`,
    programs: programs.length, occupations: new Set(rows.map((r) => r.soc)).size,
  };
}

// ── 3. Census CPS: new to the occupation / young full-time workers ─────────

async function censusGet(url: string): Promise<string[][] | null> {
  const r = await fetch(url, { headers: { 'User-Agent': userAgent() } });
  const text = await r.text();
  if (!r.ok || !text.startsWith('[')) {
    if (/invalid key/i.test(text)) throw new Error('Census API key is invalid or not activated yet');
    return null;                                     // not published (yet)
  }
  return JSON.parse(text) as string[][];
}

async function socToCensusMap(db: SupabaseClient) {
  const { socs } = await oewsMapper(db);
  const { data, error } = await db.from('census_occupations').select('census_code, soc, soc_like');
  if (error) throw new Error(`census_occupations: ${error.message}`);
  return censusCodeFor(socs, (data ?? []) as CensusOcc[]);
}

async function refreshCpsNew(db: SupabaseClient, cpi: Cpi): Promise<Outcome> {
  const key = Deno.env.get('CENSUS_API_KEY');
  if (!key) throw new Error('CENSUS_API_KEY secret is not set');
  const vars = 'PTERNWA,PWORWGT,PTIO1OCD,PRCOW1,PEST20,PEST8';
  const acc = new Map<string, Obs[]>();
  const used: number[] = [];
  let responses = 0;
  const thisYear = new Date().getUTCFullYear();
  for (const y of CPS_SUPPLEMENT_YEARS.filter((y) => y <= thisYear)) {
    const rows = await censusGet(`https://api.census.gov/data/${y}/cps/dwjt/jan?get=${vars}&PEMLR=1&PRFTLF=1&key=${key}`);
    if (!rows) continue;
    const f = cpi.factor(y);
    if (!f) continue;
    responses += addCpsRows(acc, rows, f, isNewEntrant);
    used.push(y);
  }
  if (!used.length) throw new Error('no CPS January supplement files available');
  const period = `CPS Jan ${used.join(', ')}`;
  const rows = cpsEntryRows(acc, await socToCensusMap(db), 'new_entrants_cps', period, cpi.target);
  await replaceMethod(db, 'new_entrants_cps', rows);
  return { status: 'ok', rows: rows.length, period, responses, censusOccupations: [...acc.values()].filter((o) => o.length >= 30).length };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

async function refreshCpsYoung(db: SupabaseClient, cpi: Cpi): Promise<Outcome> {
  const key = Deno.env.get('CENSUS_API_KEY');
  if (!key) throw new Error('CENSUS_API_KEY secret is not set');
  const vars = 'PTERNWA,PWORWGT,PTIO1OCD,PRCOW1,PRTAGE,PESCHENR';
  const acc = new Map<string, Obs[]>();
  const got: string[] = [];
  let responses = 0;
  // newest months may not be published yet: look back a few extra months
  const cands: Array<{ y: number; m: number }> = [];
  for (let i = 1, d = new Date(); cands.length < CPS_YOUNG_MONTHS + 4; i++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    cands.push({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  }
  for (let i = 0; i < cands.length && got.length < CPS_YOUNG_MONTHS; i += 4) {
    const batch = cands.slice(i, i + 4);
    const results = await Promise.all(batch.map((c) =>
      censusGet(`https://api.census.gov/data/${c.y}/cps/basic/${MONTHS[c.m]}?get=${vars}&PEMLR=1&PRFTLF=1&key=${key}`)
        .then((rows) => ({ c, rows }))));
    for (const { c, rows } of results) {
      if (!rows || got.length >= CPS_YOUNG_MONTHS) continue;
      const f = cpi.factor(c.y);
      if (!f) continue;
      responses += addCpsRows(acc, rows, f, isYoungNotInSchool);
      got.push(`${c.y}-${String(c.m + 1).padStart(2, '0')}`);
    }
  }
  if (got.length < 6) throw new Error(`only ${got.length} monthly CPS files available`);
  got.sort();
  const period = `CPS ${got[0]}..${got[got.length - 1]}, age 18–24`;
  const rows = cpsEntryRows(acc, await socToCensusMap(db), 'young_fulltime_cps', period, cpi.target);
  await replaceMethod(db, 'young_fulltime_cps', rows);
  return { status: 'ok', rows: rows.length, period, responses };
}
