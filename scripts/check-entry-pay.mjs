/**
 * Entry pay for one occupation in one state, from the Census Current Population
 * Survey January supplement — the same "new to the job" rule as the
 * refresh-entry-pay Edge Function (step 3 of entry_pay()), run on your PC.
 *
 * PowerShell, from the project folder:
 *   $env:CENSUS_API_KEY="<your key>"
 *   node scripts/check-entry-pay.mjs 31-1131 NJ
 *
 * Counts full-time employees (all jobs in the Census occupation that covers
 * the SOC) who were NOT doing this kind of work a year earlier, or were not
 * working. Weighted median weekly pay × 52, converted to the latest full
 * year's dollars (CPI-U), then scaled to the state with the OEWS ratio.
 * The key is only sent to api.census.gov.
 *
 * BLS (CPI and the state ratio) allows ~25 requests a day without a key. If
 * that limit is hit, set your BLS key too:  $env:BLS_API_KEY="<key>"
 * Without BLS, CPI falls back to the built-in table below and the state step is skipped.
 */
import { readFileSync } from 'node:fs';

const [soc, stateArg] = process.argv.slice(2);
const key = process.env.CENSUS_API_KEY;
if (!key) { console.error('Set the key first:  $env:CENSUS_API_KEY="<your key>"'); process.exit(1); }
if (!/^\d{2}-\d{4}$/.test(soc ?? '')) { console.error('Usage: node scripts/check-entry-pay.mjs 31-1131 NJ'); process.exit(1); }

const FIPS = { AL:'01',AK:'02',AZ:'04',AR:'05',CA:'06',CO:'08',CT:'09',DE:'10',DC:'11',FL:'12',GA:'13',HI:'15',ID:'16',IL:'17',IN:'18',IA:'19',KS:'20',KY:'21',LA:'22',ME:'23',MD:'24',MA:'25',MI:'26',MN:'27',MS:'28',MO:'29',MT:'30',NE:'31',NV:'32',NH:'33',NJ:'34',NM:'35',NY:'36',NC:'37',ND:'38',OH:'39',OK:'40',OR:'41',PA:'42',RI:'44',SC:'45',SD:'46',TN:'47',TX:'48',UT:'49',VT:'50',VA:'51',WA:'53',WV:'54',WI:'55',WY:'56' };
const fips = stateArg ? FIPS[stateArg.toUpperCase()] : null;
if (stateArg && !fips) { console.error(`Unknown state ${stateArg}`); process.exit(1); }

// 1. Census occupation that covers this SOC (same table as the database)
const sql = readFileSync('supabase/migrations/20261008000000_training_and_cert_pay.sql', 'utf8');
const census = [...sql.matchAll(/\('(\d{4})', '((?:[^']|'')*)', '([\dX-]+)', '([\d_-]+)'\)/g)]
  .map((m) => ({ code: m[1], title: m[2].replace(/''/g, "'"), soc: m[3], like: m[4] }));
const like = (s, p) => p.length === s.length && [...p].every((ch, i) => ch === '_' || ch === s[i]);
const occ = census.map((c) => ({ ...c, score: c.soc === soc ? 100 : like(soc, c.like) ? c.like.replace(/_/g, '').length : -1 }))
  .filter((c) => c.score >= 0).sort((a, b) => b.score - a.score)[0];
if (!occ) { console.error(`No Census occupation covers ${soc}`); process.exit(1); }
console.log(`Occupation: SOC ${soc} → Census ${occ.code} "${occ.title}"`);

// 2. CPI-U annual averages (BLS, no key needed for this small request)
const blsKey = process.env.BLS_API_KEY;
const blsPost = async (seriesid, startyear, endyear, extra = {}) => {
  const r = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seriesid, startyear: String(startyear), endyear: String(endyear), ...extra, ...(blsKey ? { registrationkey: blsKey } : {}) }),
  });
  return r.json();
};
const thisYear = new Date().getFullYear();
// CPI-U annual averages (CUUR0000SA0) — fallback when the BLS API refuses
const CPI_FALLBACK = new Map([[2019, 255.657], [2020, 258.811], [2021, 270.970], [2022, 292.655], [2023, 304.702], [2024, 313.689]]);
const cpiJson = await blsPost(['CUUR0000SA0'], thisYear - 8, thisYear, { annualaverage: true });
let cpi = new Map((cpiJson.Results?.series?.[0]?.data ?? []).filter((d) => d.period === 'M13').map((d) => [Number(d.year), Number(d.value)]));
const blsOk = cpi.size > 0;
if (!blsOk) {
  console.log(`BLS API unavailable (${(cpiJson.message ?? []).join(' ').slice(0, 120)}) — using built-in CPI; state step skipped.`);
  cpi = CPI_FALLBACK;
}
const target = Math.max(...cpi.keys());
const factor = (y) => cpi.get(Math.min(y, target)) ? cpi.get(target) / cpi.get(Math.min(y, target)) : null;

// 3. CPS January supplements
const VARS = 'PTERNWA,PWORWGT,PTIO1OCD,PRCOW1,PEST20,PEST8';
const obs = [];
let allNew = 0;
for (const y of [2020, 2022, 2024, 2026].filter((y) => y <= thisYear)) {
  const url = `https://api.census.gov/data/${y}/cps/dwjt/jan?get=${VARS}&PEMLR=1&PRFTLF=1&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  const text = await r.text();
  if (!text.startsWith('[')) {
    if (/invalid key|missing key/i.test(text)) { console.error('The Census API rejected the key — check it, and click the activation link in the email.'); process.exit(1); }
    console.log(`  ${y}: not available (HTTP ${r.status})`); continue;
  }
  const [head, ...rows] = JSON.parse(text);
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  const f = factor(y);
  let n = 0;
  for (const row of rows) {
    const e = Number(row[ix.PTERNWA]), w = Number(row[ix.PWORWGT]), cls = Number(row[ix.PRCOW1]);
    if (!(e > 0) || !(w > 0) || !(cls >= 1 && cls <= 4)) continue;
    const isNew = row[ix.PEST20] === '2' || row[ix.PEST8] === '2';
    if (!isNew) continue;
    allNew++;
    if (String(row[ix.PTIO1OCD]).padStart(4, '0') !== occ.code) continue;
    obs.push({ weekly: e, yearly: e * 52 * f, w, y });
    n++;
  }
  console.log(`  ${y}: ${n} new full-time ${occ.title.toLowerCase()} with earnings (CPI ×${f.toFixed(3)} → ${target} $)`);
}
const wmed = (list, k) => { const s = [...list].sort((a, b) => a[k] - b[k]); const t = s.reduce((a, b) => a + b.w, 0); let c = 0; for (const x of s) { c += x.w; if (c >= t / 2) return x[k]; } };
console.log(`New full-time employees in all occupations with earnings: ${allNew}`);
if (!obs.length) { console.log('No responses for this occupation.'); process.exit(0); }

// Census sometimes publishes weekly earnings with 2 implied decimals: check
const rawMed = wmed(obs, 'weekly');
const scale = rawMed > 5000 ? 0.01 : 1;
if (scale !== 1) console.log(`Note: weekly earnings look like cents (median raw value ${rawMed}) — dividing by 100.`);
const national = wmed(obs, 'yearly') * scale;
console.log(`\nResponses: ${obs.length} ${obs.length < 30 ? '(BELOW 30 — the app would not publish this; fallback = young full-time workers)' : '(≥ 30, publishable)'}`);
console.log(`National entry pay (new to the job, full-time): $${Math.round(national).toLocaleString()} a year in ${target} dollars`);

// 4. State scaling with OEWS (latest year)
if (fips && !blsOk) {
  console.log(`\n${stateArg.toUpperCase()} scaling skipped: needs the BLS API (set $env:BLS_API_KEY or run again tomorrow).`);
} else if (fips) {
  const s6 = soc.replace('-', '');
  const ids = [`OEUN0000000000000${s6}12`, `OEUN0000000000000${s6}13`, `OEUS${fips}00000000000${s6}12`, `OEUS${fips}00000000000${s6}13`,
    `OEUN000000000000000000012`, `OEUN000000000000000000013`, `OEUS${fips}00000000000000000${'12'}`, `OEUS${fips}00000000000000000${'13'}`];
  const j = await blsPost(ids, thisYear - 2, thisYear);
  const v = Object.fromEntries((j.Results?.series ?? []).map((s) => [s.seriesID, Number(s.data?.[0]?.value) || null]));
  const ratio = (a, b) => (v[a] && v[b] ? v[a] / v[b] : null);
  const rMed = ratio(ids[3], ids[1]) ?? ratio(ids[7], ids[5]);
  const rP25 = ratio(ids[2], ids[0]) ?? ratio(ids[6], ids[4]);
  console.log(`\nOEWS ${stateArg.toUpperCase()}: p25 $${v[ids[2]] ?? '?'} / median $${v[ids[3]] ?? '?'};  US: p25 $${v[ids[0]] ?? '?'} / median $${v[ids[1]] ?? '?'}`);
  if (rMed) console.log(`${stateArg.toUpperCase()} entry pay, median ratio ×${rMed.toFixed(3)} (as built):        $${Math.round(national * rMed / 100) * 100}`);
  if (rP25) console.log(`${stateArg.toUpperCase()} entry pay, 25th-percentile ratio ×${rP25.toFixed(3)} (proposed): $${Math.round(national * rP25 / 100) * 100}`);
}
