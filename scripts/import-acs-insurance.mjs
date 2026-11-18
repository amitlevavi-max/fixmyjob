/**
 * Health insurance through a job, by state, job and pay — from the Census
 * Bureau's American Community Survey 5-year microdata (PUMS), into Supabase
 * tables acs_health_insurance and acs_health_insurance_bands
 * (migration 20261106000000_health_insurance.sql). The calculations are in
 * scripts/acs-insurance/lib.mjs.
 *
 * Runs on your PC (api.census.gov is blocked from Claude's sandbox). About
 * 1,800 Census API calls; expect 1–3 hours. Finished states are kept in
 * data/acs/<year>/ so a stopped run picks up where it left off.
 *
 * PowerShell, from the project folder:
 *   $env:CENSUS_API_KEY="<the same key as the Supabase CENSUS_API_KEY secret>"
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key: Supabase → Project Settings → API>"
 *   node --max-old-space-size=4096 scripts/import-acs-insurance.mjs
 *
 * Options:
 *   --year 2024      last year of the 5-year file (default 2024 → 2020–2024)
 *   --states OH,WY   only these states (a quick test; US-wide rows are skipped
 *                    and nothing old is removed)
 *   --dry            work everything out and write the review file, but don't upload
 *   --fresh          ignore the saved states and download again
 *
 * Re-run once a year when Census publishes the next 5-year file (usually
 * January): node --max-old-space-size=4096 scripts/import-acs-insurance.mjs --year 2025
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  SET_A, SET_B, STATES, AGE_CHUNKS, ESR_VALUES,
  newStateTotals, addChunk, unmatched, finishState, usRows, accToJSON, accFromJSON,
} from './acs-insurance/lib.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const flag = (name) => args.includes(`--${name}`);

const year = Number(opt('year') ?? 2024);
const period = `${year - 4}-${year}`;
const dry = flag('dry');
const fresh = flag('fresh');
const only = opt('states')?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const fipsList = Object.entries(STATES).filter(([, ab]) => !only || only.includes(ab));
const partial = !!only;

const censusKey = process.env.CENSUS_API_KEY;
if (!censusKey) { console.error('Set CENSUS_API_KEY first (see the top of this file).'); process.exit(1); }
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (or add --dry).'); process.exit(1); }
if (only && fipsList.length !== only.length) { console.error(`Unknown state in --states ${only.join(',')}`); process.exit(1); }

const cacheDir = `data/acs/${year}`;
mkdirSync(cacheDir, { recursive: true });

// ── Census API ──────────────────────────────────────────────────────────────
let calls = 0;
async function census(vars, fips, esr, ages) {
  const q = `https://api.census.gov/data/${year}/acs/acs5/pums?get=${vars.join(',')}`
    + `&for=state:${fips}&ESR=${esr}&AGEP=${ages[0]}:${ages[1]}&key=${censusKey}`;
  for (let attempt = 1; ; attempt++) {
    calls++;
    try {
      const r = await fetch(q);
      if (r.status === 204) return [];                         // nobody matches
      const text = await r.text();
      if (r.ok && text.startsWith('[')) return JSON.parse(text);
      if (/invalid key/i.test(text)) throw Object.assign(new Error('Census API key is invalid or not activated yet'), { fatal: true });
      if (/unknown variable|error: /i.test(text) && r.status === 400) throw Object.assign(new Error(`Census API: ${text.slice(0, 300)}`), { fatal: true });
      if (r.status === 404) throw Object.assign(new Error(`No ${year} ACS 5-year PUMS on the Census API yet — try --year ${year - 1}`), { fatal: true });
      throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      if (e.fatal || attempt >= 5) throw e;
      await new Promise((res) => setTimeout(res, 2000 * attempt));
    }
  }
}

/** Run tasks a few at a time */
async function pool(tasks, size) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
  }));
  return out;
}

// ── One state ───────────────────────────────────────────────────────────────
async function runState(fips, ab) {
  const file = `${cacheDir}/${ab}.json`;
  if (!fresh && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (saved.period === period) {
      return { ...saved, occTotals: new Map(Object.entries(saved.occTotals).map(([k, v]) => [k, accFromJSON(v)])), cached: true };
    }
  }
  const t = newStateTotals();
  const chunks = ESR_VALUES.flatMap((esr) => AGE_CHUNKS.map((ages) => ({ esr, ages })));
  await pool(chunks.map(({ esr, ages }) => async () => {
    // The two halves must list the same people; when the API sends a short or
    // empty answer for one of them, ask again (up to 5 times)
    let a, b, gap;
    for (let attempt = 1; attempt <= 5; attempt++) {
      [a, b] = await Promise.all([census(SET_A, fips, esr, ages), census(SET_B, fips, esr, ages)]);
      gap = unmatched(a, b);
      if (gap.missing === 0) break;
      console.warn(`  ${ab} ESR ${esr}, ages ${ages[0]}–${ages[1]}: ${gap.missing} of ${gap.employees} people missing from the second answer — asking again (${attempt}/5)`);
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
    // Still a few missing: leave them out (they lack half their weights) — but stop if it's more than a handful
    if (gap.missing > Math.max(5, gap.employees * 0.005)) {
      console.error(`\n${ab}: the Census API keeps sending incomplete answers (${gap.missing} of ${gap.employees} people). Nothing saved for ${ab}; finished states are kept. Run the same command again later.`);
      process.exit(1);
    }
    addChunk(t, a, b, { skipMissing: true });   // JavaScript runs one at a time, so this is safe
  }), 3);
  if (t.skipped) console.warn(`  ${ab}: ${t.skipped} people left out (incomplete Census answer)`);
  const done = finishState(t, ab, period);
  // Stop at once if pay can't be right (the median employee earns well over $5 an hour)
  if (done.edges && done.edges[1] < 5) {
    console.error(`\n${ab}: median hourly pay came out as $${done.edges[1]} — the pay calculation is wrong. Nothing saved for ${ab}. Send this message to Claude.`);
    process.exit(1);
  }
  writeFileSync(file, JSON.stringify({
    period, state: ab, people: done.people, edges: done.edges, rows: done.rows,
    occTotals: Object.fromEntries([...done.occTotals].map(([k, v]) => [k, accToJSON(v)])),
  }));
  return { ...done, state: ab };
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log(`ACS ${period} 5-year PUMS · ${fipsList.length} state(s)${partial ? ' (partial — no US-wide rows)' : ''}${dry ? ' · dry run' : ''}`);
const started = Date.now();
const results = [];
for (const [fips, ab] of fipsList) {
  const t0 = Date.now();
  const r = await runState(fips, ab);
  results.push(r);
  const reliable = r.rows.filter((x) => x.reliable).length;
  console.log(`${ab}: ${r.people.toLocaleString()} employees, ${r.rows.length} groups (${reliable} reliable)`
    + `, pay bands ${r.edges ? r.edges.map((e) => `$${e}`).join(' / ') : '—'}`
    + (r.cached ? ' · saved earlier' : ` · ${Math.round((Date.now() - t0) / 1000)} s`));
}

const rows = results.flatMap((r) => r.rows);
if (!partial) rows.push(...usRows(results.map((r) => r.occTotals), period));
const bands = results.filter((r) => r.edges).map((r) => ({ acs_period: period, state: r.state, edges: r.edges }));

const byLevel = {};
for (const r of rows) {
  const l = (byLevel[r.level] ??= { rows: 0, reliable: 0 });
  l.rows++; if (r.reliable) l.reliable++;
}
console.log('\nRows by level:');
for (const [l, c] of Object.entries(byLevel)) console.log(`  ${l.padEnd(15)} ${String(c.rows).padStart(6)} (${c.reliable} reliable)`);
const rn = rows.filter((r) => r.occ === '3255' && (r.level === 'us_occ' || r.state === (only?.[0] ?? 'OH')) && r.level !== 'state_occ_band');
if (rn.length) console.log('Check — registered nurses:', rn.map((r) => `${r.state} ${Math.round(r.pct * 100)}% ±${Math.round(r.moe * 100)} (n ${r.n})`).join(' · '));

const reviewFile = `data/acs/acs-health-insurance-${period}${partial ? `-${only.join('-')}` : ''}.json`;
writeFileSync(reviewFile, JSON.stringify({ period, bands, rows }, null, 1));
console.log(`\nReview file: ${reviewFile}  ·  ${calls} API calls  ·  ${Math.round((Date.now() - started) / 60000)} min`);
if (dry) process.exit(0);

// ── Upload ──────────────────────────────────────────────────────────────────
const db = createClient(url, key, { auth: { persistSession: false } });
const runAt = new Date().toISOString();
for (let i = 0; i < rows.length; i += 1000) {
  const batch = rows.slice(i, i + 1000).map((r) => ({ ...r, updated_at: runAt }));
  const { error } = await db.from('acs_health_insurance').upsert(batch, { onConflict: 'acs_period,level,state,occ,wage_band' });
  if (error) { console.error(`\nUpload failed at row ${i}: ${error.message}\n(Has the migration been pushed? npx supabase db push)`); process.exit(1); }
  process.stdout.write(`\rUploaded ${Math.min(i + 1000, rows.length)} / ${rows.length}`);
}
const { error: bandErr } = await db.from('acs_health_insurance_bands')
  .upsert(bands.map((b) => ({ ...b, updated_at: runAt })), { onConflict: 'acs_period,state' });
if (bandErr) { console.error(`\nPay bands not uploaded: ${bandErr.message}`); process.exit(1); }
if (!partial) {
  // Groups of this period that no longer reach the size limit
  const { error, count } = await db.from('acs_health_insurance')
    .delete({ count: 'exact' }).eq('acs_period', period).lt('updated_at', runAt);
  if (error) console.error(`\nCleanup failed: ${error.message}`);
  else console.log(`\n${count ?? 0} old rows removed.`);
}
console.log('\nDone.');
