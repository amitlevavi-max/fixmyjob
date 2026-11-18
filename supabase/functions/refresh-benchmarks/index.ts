/**
 * refresh-benchmarks Edge Function
 *
 * Keeps the app's official wage data current. Safe to call daily — when BLS
 * hasn't published anything new it exits after one or two cheap checks.
 *
 *  1. UNION PREMIUMS — scrapes BLS "Union Members" Table 4 (union vs non-union
 *     median weekly earnings by occupation group). Published every Jan/Feb.
 *  2. OCCUPATIONS — the full OEWS occupation list (~830, BLS oe.occupation)
 *     plus ~57k everyday job titles from O*NET (job_titles.csv, CC BY 4.0)
 *     so users can find their job however they describe it. Re-imported
 *     when missing or older than 30 days.
 *  3. OEWS WAGES — p10/p25/p50/p75/p90 annual wages via the BLS Public Data
 *     API v2, for EVERY occupation, nationally and in all 50 states + DC.
 *     Order: national first, then states for tracked occupations (core list +
 *     any a user picks), then states for everything else.
 *     Each run fetches only the (area, occupation) pairs still missing for the
 *     latest year and resumes on the next run.
 *
 *  2b. EXPERIENCE — O*NET "Related Work Experience" (how much related experience
 *     is needed to be hired) per occupation → occupation_experience. Every 30 days.
 *  4. PLACES — every OEWS state and metro area (BLS oe.area) and cost of living
 *     (BEA Regional Price Parities). Re-imported when older than 30 days.
 *     Metro wages (median + number of jobs) are filled hourly for tracked
 *     occupations, and on demand when a signed-in user opens the relocation
 *     explorer for an occupation ({"job":"explore","soc":"35-2014"} with the
 *     user's login token instead of the refresh secret).
 *
 * BLS call budget: the key allows 500 calls/day. Every call is counted in
 * benchmark_refresh_log.api_calls and runs stop once the last 24 hours reach
 * DAILY_CALL_BUDGET (leaves headroom for manual runs). Run hourly — when
 * everything is current a run makes at most one cheap check call.
 *
 * Deploy:   supabase functions deploy refresh-benchmarks --no-verify-jwt
 * Secrets:  supabase secrets set BLS_API_KEY=<free key from https://data.bls.gov/registrationEngine/>
 *           supabase secrets set REFRESH_SECRET=<any long random string>
 *           supabase secrets set CONTACT_EMAIL=<email BLS can contact>   (optional)
 * Schedule: see supabase/cron_refresh_benchmarks.sql
 *
 * Manual run (e.g. first-time fill, repeat until oews.remaining = 0):
 *   curl -X POST https://<ref>.supabase.co/functions/v1/refresh-benchmarks \
 *        -H "x-refresh-secret: <REFRESH_SECRET>" -H "Content-Type: application/json" \
 *        -d '{"job":"oews"}'
 * Body options: { job?: 'all' | 'union' | 'occupations' | 'experience' | 'careerpaths' | 'areas' | 'oews' | 'degreecheck', maxCalls?: number (per run, default 45), force?: boolean }
 *   App only:   { job: 'explore', soc: '35-2014' }  (Authorization: Bearer <user access token>)
 *   'all' = union, then occupations if due, otherwise oews (keeps runs short).
 *   'all' also runs 'degreecheck' weekly: is the college-program list (degree_programs) behind
 *   IPEDS / College Scorecard? Writes "OUT OF DATE: …" to benchmark_refresh_log.detail.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { compareDegreeData, scorecardRelease } from './degreeCheck.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { parseUnionTable } from './parseUnionTable.ts';
import { parseBlsOccupations, parseOnetJobTitles, makeSocMapper } from './parseOccupations.ts';
import { parseBlsAreas, parseBeaRpp, PriceParity } from './parseAreas.ts';
import { parseRelatedExperience, categoryAt } from './parseExperience.ts';
import {
  parseJobZones, parseRelated, parseSkills, rollUpJobZones, rollUpSkills, relatedPairs,
  makeSupervisorOf, computeLinks, SupervisorRule, parseProfDegreeShare, rollUpShare,
  parseEducationLevels, rollUpEducation,
} from './careerPaths.ts';
import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2';

const BLS_API = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const UNION_TABLE_URL = 'https://www.bls.gov/news.release/union2.t04.htm';
const SERIES_PER_REQUEST = 50;   // BLS v2 limit with a registered key
const PARALLEL_REQUESTS = 1;    // BLS rate-limits shared cloud IPs — go one at a time
const REQUEST_SPACING_MS = 600;
const DEFAULT_MAX_CALLS = 45;     // per run — fits the Edge Function time limit
const DAILY_CALL_BUDGET = 450;    // BLS allows 500/day per key; keep 50 spare
const RUN_TIME_BUDGET_MS = 100_000; // stop starting new BLS calls after this (function limit is 150 s)
const RELEASE_CHECK_HOURS = 6;    // how often to re-check for a new OEWS year when all is current
const UNION_CHECK_HOURS = 24;     // the union table page is scraped at most daily in 'all' runs
const OCC_LIST_URL = 'https://download.bls.gov/pub/time.series/oe/oe.occupation';
const ONET_VERSIONS = ['31_0', '30_3', '30_2'];   // newest first; override with ONET_VERSION secret
const onetTitlesUrl = (v: string) => `https://www.onetcenter.org/dl_files/database/db_${v}_csv/job_titles.csv`;
// Related work experience lives in a different file name before O*NET 31.0
const onetExperienceUrls = (v: string) => [
  `https://www.onetcenter.org/dl_files/database/db_${v}_csv/training_and_experience.csv`,
  `https://www.onetcenter.org/dl_files/database/db_${v}_csv/education_training_and_experience.csv`,
];
const OCC_REFRESH_DAYS = 30;
const AREA_LIST_URL = 'https://download.bls.gov/pub/time.series/oe/oe.area';
const BEA_ZIP = (table: 'SARPP' | 'MARPP') => `https://apps.bea.gov/regional/zip/${table}.zip`;
const BEA_API = 'https://apps.bea.gov/api/data/';
const EXPLORE_MAX_CALLS = 30;     // per on-demand request from the app (~1 minute)

// OEWS datatype codes (annual wages; 01 = employment)
const DATATYPES: Record<string, 'p10' | 'p25' | 'p50' | 'p75' | 'p90' | 'employment'> = {
  '11': 'p10', '12': 'p25', '13': 'p50', '14': 'p75', '15': 'p90', '01': 'employment',
};
const WAGE_DTS = ['11', '12', '13', '14', '15'];   // national + states: full distribution
const METRO_DTS = ['13', '01'];                    // metros: median + number of jobs

type Area = { type: 'national' | 'state' | 'metro'; code: string; label: string };

// National + 50 states + DC.  area_code = 'US' or 2-digit state FIPS
const AREAS: Area[] = [
  { type: 'national', code: 'US', label: 'United States' },
  ...([
    ['01', 'Alabama'], ['02', 'Alaska'], ['04', 'Arizona'], ['05', 'Arkansas'], ['06', 'California'],
    ['08', 'Colorado'], ['09', 'Connecticut'], ['10', 'Delaware'], ['11', 'District of Columbia'],
    ['12', 'Florida'], ['13', 'Georgia'], ['15', 'Hawaii'], ['16', 'Idaho'], ['17', 'Illinois'],
    ['18', 'Indiana'], ['19', 'Iowa'], ['20', 'Kansas'], ['21', 'Kentucky'], ['22', 'Louisiana'],
    ['23', 'Maine'], ['24', 'Maryland'], ['25', 'Massachusetts'], ['26', 'Michigan'], ['27', 'Minnesota'],
    ['28', 'Mississippi'], ['29', 'Missouri'], ['30', 'Montana'], ['31', 'Nebraska'], ['32', 'Nevada'],
    ['33', 'New Hampshire'], ['34', 'New Jersey'], ['35', 'New Mexico'], ['36', 'New York'],
    ['37', 'North Carolina'], ['38', 'North Dakota'], ['39', 'Ohio'], ['40', 'Oklahoma'], ['41', 'Oregon'],
    ['42', 'Pennsylvania'], ['44', 'Rhode Island'], ['45', 'South Carolina'], ['46', 'South Dakota'],
    ['47', 'Tennessee'], ['48', 'Texas'], ['49', 'Utah'], ['50', 'Vermont'], ['51', 'Virginia'],
    ['53', 'Washington'], ['54', 'West Virginia'], ['55', 'Wisconsin'], ['56', 'Wyoming'],
  ] as const).map(([code, label]) => ({ type: 'state' as const, code, label })),
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-refresh-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  let body: {
    job?: 'all' | 'union' | 'occupations' | 'experience' | 'careerpaths' | 'areas' | 'oews' | 'explore' | 'degreecheck';
    soc?: string; maxCalls?: number; force?: boolean; debug?: boolean;
  } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const job = body.job ?? 'all';

  // The app may ask for one occupation's place data with the user's login
  if (job === 'explore') {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: who } = token ? await db.auth.getUser(token) : { data: { user: null } };
    if (!who?.user) return json({ error: 'sign in required' }, 401);
    if (!body.soc || !/^\d{2}-\d{4}$/.test(body.soc)) return json({ error: 'soc required, e.g. 35-2014' }, 400);
    return json({ explore: await runJob(db, 'explore', () => exploreOccupation(db, body.soc!)) });
  }

  const secret = Deno.env.get('REFRESH_SECRET');
  if (!secret || req.headers.get('x-refresh-secret') !== secret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const maxCalls = Math.max(1, Math.min(120, body.maxCalls ?? DEFAULT_MAX_CALLS));

  const result: Record<string, unknown> = {};
  if (job === 'union' || (job === 'all' && await lastRunOlderThan(db, 'union', UNION_CHECK_HOURS))) {
    result.union = await runJob(db, 'union', () => refreshUnion(db, !!body.force, !!body.debug));
  }
  if (job === 'degreecheck' || (job === 'all' && await lastRunOlderThan(db, 'degreecheck', DEGREE_CHECK_HOURS))) {
    result.degreecheck = await runJob(db, 'degreecheck', () => checkDegreePrograms(db));
  }
  let importRan = false;
  if (job === 'occupations' || (job === 'all' && await occupationsDue(db))) {
    importRan = true;
    result.occupations = await runJob(db, 'occupations', () => importOccupations(db, !!body.force));
  }
  if (job === 'experience' || (job === 'all' && !importRan && await sourceDue(db, 'onet_experience'))) {
    importRan = true;
    result.experience = await runJob(db, 'experience', () => importExperience(db));
  }
  if (job === 'careerpaths' || (job === 'all' && !importRan && await sourceDue(db, 'onet_career_paths'))) {
    importRan = true;
    result.careerpaths = await runJob(db, 'careerpaths', () => importCareerPaths(db));
  }
  if (job === 'areas' || (job === 'all' && !importRan && await sourceDue(db, 'bls_oews_areas'))) {
    importRan = true;
    result.areas = await runJob(db, 'areas', () => importAreas(db));
  }
  if (job === 'oews' || (job === 'all' && !importRan)) {
    result.oews = await runJob(db, 'oews', () => refreshOews(db, maxCalls));
  }
  return json(result);
});

type JobOutcome = { status: 'ok' | 'no_change' | 'error'; rows?: number; period?: string; detail?: string; [k: string]: unknown };

// BLS API calls made during the current job (counted even if the job fails)
let callsThisJob = 0;

async function runJob(db: SupabaseClient, job: string, fn: () => Promise<JobOutcome>): Promise<JobOutcome> {
  const { data: log } = await db.from('benchmark_refresh_log')
    .insert({ job, status: 'running' }).select('id').single();
  callsThisJob = 0;
  let out: JobOutcome;
  try {
    out = await fn();
  } catch (e) {
    out = { status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
  if (log?.id) {
    await db.from('benchmark_refresh_log').update({
      finished_at: new Date().toISOString(),
      status: out.status,
      rows_upserted: out.rows ?? 0,
      period: out.period ?? null,
      detail: out.detail ?? null,
      api_calls: callsThisJob,
    }).eq('id', log.id);
  }
  return out;
}

/** Has the job not run successfully within the last `hours`? */
async function lastRunOlderThan(db: SupabaseClient, job: string, hours: number) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const { data } = await db.from('benchmark_refresh_log').select('id')
    .eq('job', job).in('status', ['ok', 'no_change']).gte('started_at', since).limit(1);
  return !data?.length;
}

/** BLS calls made in the last 24 hours (all jobs, incl. failed runs). */
async function callsLast24h(db: SupabaseClient) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const rows = await selectAll<{ api_calls: number | null }>((f, t) =>
    db.from('benchmark_refresh_log').select('api_calls').gte('started_at', since).order('id').range(f, t));
  return rows.reduce((n, r) => n + (r.api_calls ?? 0), 0);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const userAgent = () => `FixMyJob-benchmarks/1.0 (contact: ${Deno.env.get('CONTACT_EMAIL') ?? 'unknown'})`;

// ── 1. Union premiums (BLS Union Members, Table 4) ───────────────────────────

async function refreshUnion(db: SupabaseClient, force: boolean, debug = false): Promise<JobOutcome> {
  const contact = Deno.env.get('CONTACT_EMAIL') ?? 'unknown';
  const res = await fetch(UNION_TABLE_URL, {
    headers: { 'User-Agent': `FixMyJob-benchmarks/1.0 (contact: ${contact})`, Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`BLS union table HTTP ${res.status}`);
  const html = await res.text();

  const parsed = parseUnionTable(html);
  if (debug) {
    return {
      status: 'no_change',
      period: parsed.year,
      detail: 'debug run — nothing written',
      htmlBytes: html.length,
      found: parsed.rows,
      missing: parsed.missing,
      rowsSeen: parsed.seen,
    };
  }
  // 'total' is nice-to-have (BLS prints it in a separate header row); the
  // occupation groups are what users are matched to.
  const occupationGroups = parsed.rows.filter((r) => r.group !== 'total').length;
  if (occupationGroups < 10) {
    throw new Error(
      `Union table parse found only ${occupationGroups} occupation groups (missing: ${parsed.missing.join(', ')}) — ` +
      `nothing written. Re-run with {"job":"union","debug":true} to see the rows BLS returned.`);
  }

  const { data: existing } = await db.from('union_premiums')
    .select('period').eq('period', parsed.year).limit(1);
  if (existing && existing.length > 0 && !force) {
    return { status: 'no_change', period: parsed.year, detail: `Already have ${parsed.year}` };
  }

  const rows = parsed.rows.map((r) => ({
    occupation_group: r.group,
    occupation_label: r.label,
    soc_majors: r.soc,
    union_weekly: r.unionWeekly,
    nonunion_weekly: r.nonunionWeekly,
    period: parsed.year,
    released_at: new Date().toISOString().slice(0, 10),   // first seen
    source_url: UNION_TABLE_URL,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await db.from('union_premiums').upsert(rows, { onConflict: 'occupation_group,period' });
  if (error) throw new Error(error.message);
  return { status: 'ok', rows: rows.length, period: parsed.year };
}

// ── 3. OEWS wages (BLS API) ─────────────────────────────────────────────────

function seriesId(area: Area, soc: string, datatype: string) {
  const areaType = area.type === 'national' ? 'N' : area.type === 'state' ? 'S' : 'M';
  const areaCode = area.type === 'national' ? '0000000' : area.type === 'state' ? `${area.code}00000` : area.code;
  return `OEU${areaType}${areaCode}000000${soc.replace('-', '')}${datatype}`;
}

async function blsFetch(seriesIds: string[]) {
  const key = Deno.env.get('BLS_API_KEY');
  if (!key) throw new Error('BLS_API_KEY secret is not set');
  const contact = Deno.env.get('CONTACT_EMAIL') ?? 'unknown';

  // Retry 429 / 5xx with backoff (honours Retry-After when BLS sends it)
  let res: Response | null = null;
  const waits = [3000, 8000, 20000];
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    callsThisJob++;   // every attempt counts against the daily limit
    res = await fetch(BLS_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `FixMyJob-benchmarks/1.0 (contact: ${contact})`,
      },
      body: JSON.stringify({ seriesid: seriesIds, latest: true, registrationkey: key }),
    });
    if (res.ok) break;
    if (res.status !== 429 && res.status < 500) break;
    if (attempt === waits.length) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    await res.body?.cancel();
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : waits[attempt]);
  }
  if (!res || !res.ok) {
    const snippet = res ? (await res.text()).replace(/\s+/g, ' ').slice(0, 300) : '';
    throw new Error(`BLS API HTTP ${res?.status} after retries${snippet ? ` — ${snippet}` : ''}`);
  }
  await sleep(REQUEST_SPACING_MS);
  const j = await res.json();
  if (j.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS API: ${j.status} ${(j.message ?? []).join(' ')}`);
  }
  const out = new Map<string, { year: string; value: number | null }>();
  for (const s of j.Results?.series ?? []) {
    const d = s.data?.[0];
    if (!d) continue;
    const raw = String(d.value).trim();
    // '#' = wage at/above BLS top-code ($239,200); '*' / '-' = not available
    const value = raw === '#' ? 239200 : Number(raw.replace(/,/g, ''));
    out.set(s.seriesID, { year: String(d.year), value: Number.isFinite(value) ? value : null });
  }
  return out;
}

// Supabase returns at most 1,000 rows per request — page through bigger reads.
async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

// ── 2. Occupation catalogue (BLS list + O*NET everyday titles) ──────────────

async function occupationsDue(db: SupabaseClient) {
  const { data } = await db.from('occupation_sources').select('imported_at').eq('source', 'onet_job_titles').maybeSingle();
  if (!data?.imported_at) return true;
  return Date.now() - new Date(data.imported_at).getTime() > OCC_REFRESH_DAYS * 86400_000;
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: 'text/plain,text/csv,*/*' } });
  if (!res.ok) { await res.body?.cancel(); throw new Error(`HTTP ${res.status} for ${url}`); }
  return await res.text();
}

async function importOccupations(db: SupabaseClient, _force: boolean): Promise<JobOutcome> {
  // 1. Every occupation OEWS publishes
  const occs = parseBlsOccupations(await fetchText(OCC_LIST_URL));
  if (occs.length < 600) throw new Error(`BLS occupation list parse found only ${occs.length} occupations — nothing written`);
  const now = new Date().toISOString();
  for (let i = 0; i < occs.length; i += 500) {
    const { error } = await db.from('occupations').upsert(
      occs.slice(i, i + 500).map((o) => ({ soc: o.soc, title: o.title, major_group: o.majorGroup, updated_at: now })),
      { onConflict: 'soc' });
    if (error) throw new Error(`occupations: ${error.message}`);
  }

  // 2. Everyday job titles from O*NET (newest database version available)
  const override = Deno.env.get('ONET_VERSION');
  const versions = override ? [override.replace('.', '_'), ...ONET_VERSIONS] : ONET_VERSIONS;
  let csv = '';
  let version = '';
  const tried: string[] = [];
  for (const v of versions) {
    try { csv = await fetchText(onetTitlesUrl(v)); version = v.replace('_', '.'); break; }
    catch (e) { tried.push(e instanceof Error ? e.message : String(e)); }
  }
  if (!csv) throw new Error(`Could not download O*NET job titles: ${tried.join('; ')}`);
  const onet = parseOnetJobTitles(csv);
  if (onet.length < 20000) throw new Error(`O*NET job titles parse found only ${onet.length} titles — nothing written`);

  // 3. Map to OEWS occupations; include each occupation's official BLS title too
  const toOews = makeSocMapper(occs.map((o) => o.soc));
  const titles = new Map<string, { soc: string; title: string; title_lc: string; source: string }>();
  const add = (soc: string, title: string, source: string) => {
    const title_lc = title.toLowerCase();
    const k = `${soc}|${title_lc}`;
    if (!titles.has(k)) titles.set(k, { soc, title, title_lc, source });
  };
  for (const o of occs) add(o.soc, o.title, 'bls');
  let unmapped = 0;
  for (const t of onet) {
    const soc = toOews(t.onetSoc);
    if (soc) add(soc, t.title, 'onet'); else unmapped++;
  }

  const rows = [...titles.values()];
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from('occupation_titles')
      .upsert(rows.slice(i, i + 1000), { onConflict: 'soc,title_lc', ignoreDuplicates: true });
    if (error) throw new Error(`occupation_titles: ${error.message}`);
  }

  await db.from('occupation_sources').upsert([
    { source: 'bls_oews_occupations', version: null, rows: occs.length, imported_at: now },
    { source: 'onet_job_titles', version, rows: rows.length, imported_at: now },
  ], { onConflict: 'source' });

  return { status: 'ok', rows: rows.length, period: `O*NET ${version}`, occupations: occs.length, titles: rows.length, unmappedOnetTitles: unmapped };
}

// ── 3b. OEWS wage refresh ───────────────────────────────────────────────────

// ── 2b. Related work experience (O*NET) ─────────────────────────────────────

async function importExperience(db: SupabaseClient): Promise<JobOutcome> {
  const override = Deno.env.get('ONET_VERSION');
  const versions = override ? [override.replace('.', '_'), ...ONET_VERSIONS] : ONET_VERSIONS;
  let csv = '';
  let version = '';
  const tried: string[] = [];
  outer: for (const v of versions) {
    for (const url of onetExperienceUrls(v)) {
      try { csv = await fetchText(url); version = v.replace('_', '.'); break outer; }
      catch (e) { tried.push(e instanceof Error ? e.message : String(e)); }
    }
  }
  if (!csv) throw new Error(`Could not download O*NET experience data: ${tried.join('; ')}`);
  const items = parseRelatedExperience(csv);
  if (items.length < 500) throw new Error(`O*NET experience parse found only ${items.length} occupations — nothing written`);

  // Group the O*NET-SOC detail codes under each OEWS occupation
  const socs = (await selectAll<{ soc: string }>((f, t) => db.from('occupations').select('soc').order('soc').range(f, t)))
    .map((r) => r.soc);
  if (!socs.length) throw new Error('occupations table is empty — run {"job":"occupations"} first');
  const toOews = makeSocMapper(socs);
  const groups = new Map<string, typeof items>();
  let unmapped = 0;
  for (const it of items) {
    const soc = toOews(it.onetSoc);
    if (!soc) { unmapped++; continue; }
    if (!groups.has(soc)) groups.set(soc, []);
    groups.get(soc)!.push(it);
  }
  const now = new Date().toISOString();
  const rows = [...groups.entries()].map(([soc, list]) => {
    // Prefer the main (.00) O*NET code; otherwise average the detail codes
    const main = list.filter((x) => x.onetSoc.endsWith('.00'));
    const use = main.length ? main : list;
    const dist = new Array(11).fill(0).map((_, i) =>
      Math.round((use.reduce((s, x) => s + x.dist[i], 0) / use.length) * 100) / 100);
    return {
      soc, dist,
      median_cat: categoryAt(dist, 50),
      p25_cat: categoryAt(dist, 25),
      p75_cat: categoryAt(dist, 75),
      onet_codes: use.map((x) => x.onetSoc),
      low_precision: use.every((x) => x.suppressed),
      onet_version: version,
      updated_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('occupation_experience').upsert(rows.slice(i, i + 500), { onConflict: 'soc' });
    if (error) throw new Error(`occupation_experience: ${error.message}`);
  }
  await db.from('occupation_sources').upsert(
    { source: 'onet_experience', version, rows: rows.length, imported_at: now }, { onConflict: 'source' });
  return { status: 'ok', rows: rows.length, period: `O*NET ${version}`, unmappedOnetCodes: unmapped };
}

// ── 4. Places: OEWS areas + cost of living ──────────────────────────────────

async function sourceDue(db: SupabaseClient, source: string) {
  const { data } = await db.from('occupation_sources').select('imported_at').eq('source', source).maybeSingle();
  if (!data?.imported_at) return true;
  return Date.now() - new Date(data.imported_at).getTime() > OCC_REFRESH_DAYS * 86400_000;
}

/** BEA RPP table: bulk zip first, then the BEA API if a BEA_API_KEY secret is set. */
async function fetchRpp(table: 'SARPP' | 'MARPP', kind: 'state' | 'metro'): Promise<PriceParity[]> {
  const problems: string[] = [];
  try {
    const res = await fetch(BEA_ZIP(table), { headers: { 'User-Agent': userAgent() } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const out: PriceParity[] = [];
    for (const [name, bytes] of Object.entries(files)) {
      if (!/\.csv$/i.test(name)) continue;
      out.push(...parseBeaRpp(strFromU8(bytes), kind));
    }
    if (out.length) return out;
    problems.push(`${table}.zip had no usable rows`);
  } catch (e) {
    problems.push(`${table}.zip: ${e instanceof Error ? e.message : String(e)}`);
  }
  const key = Deno.env.get('BEA_API_KEY');
  if (key) {
    const url = `${BEA_API}?UserID=${key}&method=GetData&datasetname=Regional&TableName=${table}` +
      `&LineCode=1&GeoFips=${kind === 'state' ? 'STATE' : 'MSA'}&Year=LAST5&ResultFormat=json`;
    const res = await fetch(url);
    const j = await res.json().catch(() => null);
    const data: Array<{ GeoFips: string; TimePeriod: string; DataValue: string }> = j?.BEAAPI?.Results?.Data ?? [];
    const latest = new Map<string, PriceParity>();
    for (const d of data) {
      const fips = String(d.GeoFips).replace(/\D/g, '');
      const rpp = Number(String(d.DataValue).replace(/,/g, ''));
      if (!Number.isFinite(rpp) || fips === '00000') continue;
      const code = kind === 'state' ? fips.slice(0, 2) : fips;
      const prev = latest.get(code);
      if (!prev || d.TimePeriod > prev.year) latest.set(code, { area_type: kind, area_code: code, year: d.TimePeriod, rpp });
    }
    if (latest.size) return [...latest.values()];
    problems.push(`BEA API returned no data`);
  }
  throw new Error(`Cost-of-living data unavailable (${problems.join('; ')})`);
}

async function importAreas(db: SupabaseClient): Promise<JobOutcome> {
  const areas = parseBlsAreas(await fetchText(AREA_LIST_URL));
  const metros = areas.filter((a) => a.area_type === 'metro').length;
  if (metros < 300) throw new Error(`BLS area list parse found only ${metros} metro areas — nothing written`);
  const now = new Date().toISOString();
  for (let i = 0; i < areas.length; i += 500) {
    const { error } = await db.from('wage_areas')
      .upsert(areas.slice(i, i + 500).map((a) => ({ ...a, updated_at: now })), { onConflict: 'area_type,area_code' });
    if (error) throw new Error(`wage_areas: ${error.message}`);
  }

  // Cost of living — optional: wages still work without it
  let rppRows = 0;
  let rppNote: string | undefined;
  try {
    // The zips hold several overlapping CSVs — keep one value per place (latest year)
    const latest = new Map<string, PriceParity>();
    for (const r of [...await fetchRpp('SARPP', 'state'), ...await fetchRpp('MARPP', 'metro')]) {
      const key = `${r.area_type}:${r.area_code}`;
      const prev = latest.get(key);
      if (!prev || r.year > prev.year) latest.set(key, r);
    }
    const rpp = [...latest.values()];
    for (let i = 0; i < rpp.length; i += 500) {
      const { error } = await db.from('price_parities')
        .upsert(rpp.slice(i, i + 500).map((r) => ({ ...r, updated_at: now })), { onConflict: 'area_type,area_code' });
      if (error) throw new Error(`price_parities: ${error.message}`);
    }
    rppRows = rpp.length;
    await db.from('occupation_sources').upsert(
      { source: 'bea_rpp', version: rpp[0]?.year ?? null, rows: rppRows, imported_at: now }, { onConflict: 'source' });
  } catch (e) {
    rppNote = e instanceof Error ? e.message : String(e);
  }

  await db.from('occupation_sources').upsert(
    { source: 'bls_oews_areas', version: null, rows: areas.length, imported_at: now }, { onConflict: 'source' });
  return {
    status: 'ok', rows: areas.length + rppRows,
    states: areas.length - metros, metros, costOfLivingRows: rppRows,
    detail: rppNote ? `Areas loaded; cost of living not loaded: ${rppNote}` : undefined,
  };
}

// ── 3b. OEWS wage refresh ───────────────────────────────────────────────────

type Pair = { area: Area; soc: string; dts: string[] };

/** Latest OEWS year: reuse a recent check, otherwise one cheap probe call. */
async function latestOewsYear(db: SupabaseClient): Promise<string> {
  const recent = new Date(Date.now() - RELEASE_CHECK_HOURS * 3600_000).toISOString();
  const { data: lastOk } = await db.from('benchmark_refresh_log').select('period')
    .in('job', ['oews', 'explore']).in('status', ['ok', 'no_change']).not('period', 'is', null)
    .gte('started_at', recent).order('started_at', { ascending: false }).limit(1);
  if (lastOk?.[0]?.period) return String(lastOk[0].period);
  const probe = await blsFetch([seriesId(AREAS[0], '00-0000', '13')]);
  const year = [...probe.values()][0]?.year;
  if (!year) throw new Error('Could not determine latest OEWS year');
  return year;
}

async function metroAreas(db: SupabaseClient, includeNonmetro = true): Promise<Area[]> {
  const rows = await selectAll<{ area_code: string; name: string; is_nonmetro: boolean }>((f, t) =>
    db.from('wage_areas').select('area_code, name, is_nonmetro').eq('area_type', 'metro').order('area_code').range(f, t));
  return rows
    .filter((r) => includeNonmetro || !r.is_nonmetro)
    .map((r) => ({ type: 'metro' as const, code: r.area_code, label: r.name }));
}

/** Pairs already stored for this year, as 'type:code:soc' keys (optionally for one SOC). */
async function donePairs(db: SupabaseClient, year: string, soc?: string) {
  const have = await selectAll<{ soc: string; area_type: string; area_code: string }>((f, t) => {
    let q = db.from('wage_benchmarks').select('soc, area_type, area_code')
      .eq('period', year).eq('source', 'bls_oews');
    if (soc) q = q.eq('soc', soc);
    return q.order('id').range(f, t);
  });
  return new Set(have.map((r) => `${r.area_type}:${r.area_code}:${r.soc}`));
}

/**
 * Fetch missing pairs in priority order until the call or time budget runs
 * out; saves whatever was fetched. Pairs are packed whole into 50-series calls.
 */
async function fillPairs(db: SupabaseClient, missing: Pair[], allowed: number, year: string, started: number) {
  const fetched: Pair[] = [];
  const values = new Map<string, { year: string; value: number | null }>();
  let stopReason = 'call budget for this run reached';
  let failure: string | null = null;
  let i = 0;
  while (i < missing.length) {
    if (callsThisJob >= allowed) break;
    if (Date.now() - started > RUN_TIME_BUDGET_MS) { stopReason = 'time limit for this run reached'; break; }
    const batch: Pair[] = [];
    let n = 0;
    while (i < missing.length && n + missing[i].dts.length <= SERIES_PER_REQUEST) {
      batch.push(missing[i]); n += missing[i].dts.length; i++;
    }
    const ids = batch.flatMap((p) => p.dts.map((dt) => seriesId(p.area, p.soc, dt)));
    try {
      const m = await blsFetch(ids);
      for (const [k, v] of m) values.set(k, v);
      fetched.push(...batch);
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      break;
    }
    if (i >= missing.length) stopReason = 'all missing pairs fetched';
  }

  const rows = fetched.map(({ area, soc, dts }) => {
    const row: Record<string, unknown> = {
      source: 'bls_oews', soc, area_type: area.type, area_code: area.code, area_label: area.label,
      period: year, fetched_at: new Date().toISOString(),
    };
    let any = false;
    for (const dt of dts) {
      const v = values.get(seriesId(area, soc, dt));
      if (v && v.year === year && v.value !== null) { row[DATATYPES[dt]] = v.value; any = true; }
    }
    // Keep a placeholder row even when BLS suppresses the cell, so the pair is
    // marked done; the app skips rows without a median.
    return any ? row : { ...row, p50: null };
  });
  for (let k = 0; k < rows.length; k += 500) {
    const { error } = await db.from('wage_benchmarks')
      .upsert(rows.slice(k, k + 500), { onConflict: 'source,soc,area_type,area_code,period' });
    if (error) throw new Error(error.message);
  }
  return { fetched, rows, failure, stopReason };
}

async function refreshOews(db: SupabaseClient, maxCalls: number): Promise<JobOutcome> {
  const started = Date.now();
  const usedToday = await callsLast24h(db);
  // Calls this run may make (retries count too — see blsFetch)
  const allowed = Math.min(maxCalls, DAILY_CALL_BUDGET - usedToday);
  if (allowed < 2) {
    return { status: 'no_change', detail: `Daily BLS budget used (${usedToday} calls in the last 24 h) — will continue later`, callsLast24h: usedToday };
  }
  const latestYear = await latestOewsYear(db);

  const all = await selectAll<{ soc: string }>((f, t) => db.from('occupations').select('soc').order('soc').range(f, t));
  const tracked = await selectAll<{ soc: string }>((f, t) =>
    db.from('tracked_occupations').select('soc').eq('active', true).order('soc').range(f, t));
  const trackedSocs = [...new Set(tracked.map((o) => o.soc))];
  const otherSocs = all.map((o) => o.soc).filter((s) => !trackedSocs.includes(s));
  const nationalSocs = [...new Set(['00-0000', ...trackedSocs, ...otherSocs])];
  if (nationalSocs.length <= 1) {
    return { status: 'no_change', period: latestYear, detail: 'No occupations loaded yet — run {"job":"occupations"} first' };
  }
  const metros = await metroAreas(db);
  const done = await donePairs(db, latestYear);

  // Missing pairs, in priority order:
  //   national (all) → states (tracked) → metros (tracked) → states (everything else)
  const missing: Pair[] = [];
  const want = (area: Area, soc: string, dts: string[]) => {
    if (!done.has(`${area.type}:${area.code}:${soc}`)) missing.push({ area, soc, dts });
  };
  for (const soc of nationalSocs) want(AREAS[0], soc, WAGE_DTS);
  for (const area of AREAS.slice(1)) for (const soc of trackedSocs) want(area, soc, WAGE_DTS);
  for (const soc of trackedSocs) for (const area of metros) if (soc !== '00-0000') want(area, soc, METRO_DTS);
  for (const area of AREAS.slice(1)) for (const soc of otherSocs) want(area, soc, WAGE_DTS);
  if (!missing.length) return { status: 'no_change', period: latestYear, detail: `All occupations and areas current for ${latestYear}` };

  const { fetched, rows, failure, stopReason } = await fillPairs(db, missing, allowed, latestYear, started);
  const remaining = missing.length - fetched.length;
  const callsLeft = Math.ceil(missing.slice(fetched.length).reduce((n, p) => n + p.dts.length, 0) / SERIES_PER_REQUEST);
  return {
    status: failure && !rows.length ? 'error' : 'ok',
    rows: rows.length,
    period: latestYear,
    withWages: rows.filter((r) => r.p50 !== null).length,
    remaining,
    nationalRemaining: missing.filter((m) => m.area.type === 'national').length
      - fetched.filter((b) => b.area.type === 'national').length,
    apiCalls: callsThisJob,
    callsLast24h: usedToday + callsThisJob,
    detail: failure ? `Stopped early: ${failure}` : remaining ? `Stopped: ${stopReason}` : undefined,
    estDaysToFinish: remaining ? Math.ceil(callsLeft / DAILY_CALL_BUDGET * 10) / 10 : 0,
  };
}

/**
 * On demand from the app: everything the relocation explorer needs for one
 * occupation (state wages + metro medians and job counts). Also starts
 * tracking the occupation so the hourly refresh keeps it current.
 */
async function exploreOccupation(db: SupabaseClient, soc: string): Promise<JobOutcome> {
  const started = Date.now();
  const { data: occ } = await db.from('occupations').select('soc, title').eq('soc', soc).maybeSingle();
  if (!occ) return { status: 'error', detail: `Unknown occupation ${soc}` };
  await db.from('tracked_occupations').upsert({ soc: occ.soc, title: occ.title }, { onConflict: 'soc', ignoreDuplicates: true });

  const usedToday = await callsLast24h(db);
  const allowed = Math.min(EXPLORE_MAX_CALLS, DAILY_CALL_BUDGET - usedToday);
  if (allowed < 2) return { status: 'no_change', detail: 'Daily BLS budget used — try again later' };
  const year = await latestOewsYear(db);
  const done = await donePairs(db, year, soc);
  const metros = await metroAreas(db, false);   // cities first; rural areas follow in the hourly refresh

  const missing: Pair[] = [];
  for (const area of metros) if (!done.has(`metro:${area.code}:${soc}`)) missing.push({ area, soc, dts: METRO_DTS });
  for (const area of AREAS) if (!done.has(`${area.type}:${area.code}:${soc}`)) missing.push({ area, soc, dts: WAGE_DTS });
  if (!missing.length) return { status: 'no_change', period: year, detail: 'Already complete' };

  const { fetched, rows, failure } = await fillPairs(db, missing, allowed, year, started);
  return {
    status: failure && !rows.length ? 'error' : 'ok',
    rows: rows.length, period: year,
    remaining: missing.length - fetched.length,
    apiCalls: callsThisJob,
    detail: failure ? `Stopped early: ${failure}` : undefined,
  };
}

// ── 2c. Career paths: Job Zones, related occupations, skills (O*NET) ────────
//
// Fills occupation_job_zones, occupation_skills and occupation_links
// (advancement / career change / lower-pay moves per occupation, rules in
// careerPaths.ts). Re-imported every OCC_REFRESH_DAYS, so a new OEWS year or
// O*NET release flows in within a month; force with {"job":"careerpaths"}.

const onetCareerUrls = (v: string) => {
  const base = `https://www.onetcenter.org/dl_files/database/db_${v}_csv`;
  return {
    zones: [`${base}/job_zones.csv`],
    related: [`${base}/related_occupations.csv`],
    // O*NET 31.0 renamed Skills to Transferable Skills
    skills: [`${base}/transferable_skills.csv`, `${base}/skills.csv`],
    // Required level of education (scale RL) — renamed in O*NET 31.0
    education: [`${base}/education.csv`, `${base}/education_training_and_experience.csv`],
  };
};

async function fetchFirst(urls: string[]) {
  let last = '';
  for (const url of urls) {
    try { return await fetchText(url); } catch (e) { last = e instanceof Error ? e.message : String(e); }
  }
  throw new Error(last);
}

async function replaceRows(db: SupabaseClient, table: string, rows: Record<string, unknown>[], onConflict: string, now: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 1000), { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  // Rows not written in this run are stale (e.g. a link that no longer qualifies)
  const { error } = await db.from(table).delete().lt('updated_at', now);
  if (error) throw new Error(`${table} cleanup: ${error.message}`);
}

async function importCareerPaths(db: SupabaseClient): Promise<JobOutcome> {
  const override = Deno.env.get('ONET_VERSION');
  const versions = override ? [override.replace('.', '_'), ...ONET_VERSIONS] : ONET_VERSIONS;
  let zonesCsv = '', relatedCsv = '', skillsCsv = '', educationCsv = '', version = '';
  const tried: string[] = [];
  for (const v of versions) {
    try {
      const u = onetCareerUrls(v);
      [zonesCsv, relatedCsv, skillsCsv, educationCsv] = await Promise.all([fetchFirst(u.zones), fetchFirst(u.related), fetchFirst(u.skills), fetchFirst(u.education)]);
      version = v.replace('_', '.');
      break;
    } catch (e) { tried.push(e instanceof Error ? e.message : String(e)); }
  }
  if (!version) throw new Error(`Could not download O*NET career-path files: ${tried.join('; ')}`);

  const jzRaw = parseJobZones(zonesCsv);
  const relRaw = parseRelated(relatedCsv);
  const skRaw = parseSkills(skillsCsv);
  const eduRaw = parseProfDegreeShare(educationCsv);
  const eduLv = parseEducationLevels(educationCsv);
  zonesCsv = relatedCsv = skillsCsv = educationCsv = '';
  if (jzRaw.size < 700 || relRaw.length < 10000 || skRaw.size < 700 || eduRaw.size < 700) {
    throw new Error(`O*NET parse looks wrong (job zones ${jzRaw.size}, related ${relRaw.length}, skills ${skRaw.size}, education ${eduRaw.size}) — nothing written`);
  }

  const socs = (await selectAll<{ soc: string }>((f, t) => db.from('occupations').select('soc').order('soc').range(f, t)))
    .map((r) => r.soc);
  if (!socs.length) throw new Error('occupations table is empty — run {"job":"occupations"} first');
  const toOews = makeSocMapper(socs);
  const zones = rollUpJobZones(jzRaw, toOews);
  const skills = rollUpSkills(skRaw, toOews);
  const pairs = relatedPairs(relRaw, toOews);
  const profDegree = rollUpShare(eduRaw, toOews);
  const eduLevels = rollUpEducation(eduLv, toOews);

  const wages = await selectAll<{ soc: string; p50: number | null; period: string }>((f, t) =>
    db.from('latest_wage_benchmarks').select('soc, p50, period').eq('area_type', 'national').order('soc').range(f, t));
  const medians = new Map(wages.filter((w) => Number(w.p50) > 0).map((w) => [w.soc, Number(w.p50)] as [string, number]));
  if (medians.size < 500) throw new Error(`only ${medians.size} national medians loaded — run the OEWS job first`);
  const wagePeriod = wages.reduce((m, w) => (w.period > m ? w.period : m), '');

  const { data: rules, error: rulesErr } = await db.from('supervisor_rules').select('prefix, supervisor_soc');
  if (rulesErr) throw new Error(`supervisor_rules: ${rulesErr.message} (is the career_paths migration applied?)`);

  const links = computeLinks({
    socs, pairs, medians, skills, profDegree,
    zones: new Map([...zones].map(([s, z]) => [s, z.zone] as [string, number])),
    supervisorOf: makeSupervisorOf((rules ?? []) as SupervisorRule[]),
  });

  const now = new Date().toISOString();
  await replaceRows(db, 'occupation_job_zones',
    [...zones].map(([soc, z]) => ({ soc, job_zone: z.zone, onet_codes: z.codes, onet_version: version, updated_at: now })), 'soc', now);
  const skillRows: Record<string, unknown>[] = [];
  for (const [soc, m] of skills) {
    for (const [skill, r] of m) skillRows.push({ soc, skill, importance: r.im, level: r.lv, onet_version: version, updated_at: now });
  }
  await replaceRows(db, 'occupation_skills', skillRows, 'soc,skill', now);
  await replaceRows(db, 'occupation_education',
    [...eduLevels].map(([soc, e]) => ({ soc, typical_level: e.level, typical_share: e.share, levels: e.dist, onet_codes: e.codes, onet_version: version, updated_at: now })),
    'soc', now);
  await replaceRows(db, 'occupation_links',
    links.map((l) => ({ ...l, wage_period: wagePeriod, onet_version: version, updated_at: now })), 'soc,target_soc', now);

  await db.from('occupation_sources').upsert(
    { source: 'onet_career_paths', version, rows: links.length, imported_at: now }, { onConflict: 'source' });
  const count = (k: string) => links.filter((l) => l.kind === k).length;
  return {
    status: 'ok', rows: links.length, period: `O*NET ${version} · OEWS ${wagePeriod}`,
    advancement: count('advancement'), career_change: count('career_change'), lower_pay: count('lower_pay'),
    jobZones: zones.size, skillRows: skillRows.length, educationLevels: eduLevels.size,
  };
}

// ── 5. College programs: freshness check (degreeCheck.ts) ─────────────────
//
// degree_programs is loaded by hand (scripts/import-degree-programs.mjs on the
// PC). Weekly, see whether IPEDS or College Scorecard has published newer data.

const DEGREE_CHECK_HOURS = 24 * 7;
const IPEDS_DATA_URL = 'https://nces.ed.gov/ipeds/datacenter/data';
const SCORECARD_DATA_PAGE = 'https://collegescorecard.ed.gov/data/';

async function urlExists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': userAgent() } });
    await res.body?.cancel();
    return res.ok;
  } catch { return false; }
}

async function checkDegreePrograms(db: SupabaseClient): Promise<JobOutcome> {
  const { data, error } = await db.from('degree_programs').select('data_year')
    .order('imported_at', { ascending: false }).limit(1);
  if (error) throw new Error(`degree_programs: ${error.message} (is migration 20261020010000_degree_programs.sql applied?)`);
  const have = (data?.[0]?.data_year as string | undefined) ?? null;

  // Newest IPEDS completions file (C<year>_A.zip), this year back 5 years
  let ipeds: number | null = null;
  const thisYear = new Date().getUTCFullYear();
  for (let y = thisYear; y >= thisYear - 5; y--) {
    if (await urlExists(`${IPEDS_DATA_URL}/C${y}_A.zip`)) { ipeds = y; break; }
  }
  let scorecard: string | null = null;
  try { scorecard = scorecardRelease(await fetchText(SCORECARD_DATA_PAGE)); } catch { /* reported as not found */ }

  const c = compareDegreeData(have, ipeds, scorecard);
  return { status: 'ok', rows: 0, period: have ?? undefined, detail: c.detail, outOfDate: c.outOfDate, latestIpeds: ipeds, latestScorecard: scorecard };
}
