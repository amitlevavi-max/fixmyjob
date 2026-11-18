/**
 * Health insurance through a job — the calculations behind
 * scripts/import-acs-insurance.mjs (kept apart so they can be tested without
 * the Census API: scripts/acs-insurance/test.mjs).
 *
 * Source: US Census Bureau, American Community Survey 5-year Public Use
 * Microdata Sample (PUMS), person records, through the Census Data API.
 *
 *   Who:      employees (class of worker COW 1–5) aged 18–64 with a job
 *             (ESR 1 or 2) and a valid occupation (OCCP)
 *   Measure:  HINS1 = 1 — "insurance through a current or former employer or
 *             union" (the person's own job or a family member's)
 *   Weights:  PWGTP; margin of error from the 80 replicate weights
 *             (Census successive-difference formula: SE² = 4/80 · Σ (p_r − p)²),
 *             90% MOE = 1.645 · SE
 *   Pay:      hourly = WAGP × ADJINC / 10^6 ÷ (WKHP × WKWN) — wages in the
 *             last 12 months in the file's latest-year dollars ÷ hours worked
 *
 * Wage bands are per state: band 1 = below that state's 25th percentile of
 * hourly pay (weighted), 2 = 25th–50th, 3 = 50th–75th, 4 = 75th and up.
 * Pay is grouped in $0.50 steps first, so a state is never held in memory row
 * by row; the edges are multiples of $0.50.
 */

export const REPS = 80;
/** Store a group only from this many people up (smaller ones are noise) */
export const MIN_N_STORE = 30;
/** "reliable" (the app uses only these): enough people and a narrow margin */
export const MIN_N_RELIABLE = 100;
export const MAX_MOE = 0.10;
/** $0.50 steps up to $200/hr */
export const BIN_WIDTH = 0.5;
export const MAX_BIN = 400;

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Two calls per chunk — the Census API returns at most 50 variables per call */
export const SET_A = [
  'SERIALNO', 'SPORDER', 'PWGTP', 'HINS1', 'OCCP', 'SOCP', 'WAGP', 'WKHP', 'WKWN', 'ADJINC', 'COW',
  ...range(1, 39).map((i) => `PWGTP${i}`),
];
export const SET_B = ['SERIALNO', 'SPORDER', ...range(40, 80).map((i) => `PWGTP${i}`)];

/** 50 states + DC: FIPS → postal code */
export const STATES = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

/** Age chunks keep each API answer small enough for big states */
export const AGE_CHUNKS = [[18, 22], [23, 27], [28, 32], [33, 37], [38, 42], [43, 47], [48, 52], [53, 57], [58, 64]];
export const ESR_VALUES = ['1', '2'];

// ── Accumulators ────────────────────────────────────────────────────────────

/** n = people; N[r] / Y[r] = weighted people / weighted insured, r = 0 (main weight) … 80 */
export function newAcc() {
  return { n: 0, N: new Float64Array(REPS + 1), Y: new Float64Array(REPS + 1) };
}

export function addPerson(acc, w, insured) {
  acc.n++;
  for (let r = 0; r <= REPS; r++) {
    acc.N[r] += w[r];
    if (insured) acc.Y[r] += w[r];
  }
}

export function mergeAcc(into, from) {
  into.n += from.n;
  for (let r = 0; r <= REPS; r++) { into.N[r] += from.N[r]; into.Y[r] += from.Y[r]; }
}

/** Share insured, its 90% margin of error, and whether the app may use it */
export function estimate(acc) {
  if (!acc || acc.N[0] <= 0) return null;
  const p = acc.Y[0] / acc.N[0];
  let ss = 0;
  for (let r = 1; r <= REPS; r++) {
    const pr = acc.N[r] > 0 ? acc.Y[r] / acc.N[r] : p;
    ss += (pr - p) ** 2;
  }
  const moe = 1.645 * Math.sqrt((4 / REPS) * ss);
  return { pct: round4(p), moe: round4(moe), n: acc.n, reliable: acc.n >= MIN_N_RELIABLE && moe <= MAX_MOE };
}

const round4 = (x) => Math.round(x * 10000) / 10000;

export function accToJSON(acc) {
  return { n: acc.n, N: Array.from(acc.N), Y: Array.from(acc.Y) };
}
export function accFromJSON(j) {
  return { n: j.n, N: Float64Array.from(j.N), Y: Float64Array.from(j.Y) };
}

// ── Reading the API answers ─────────────────────────────────────────────────

/** "3255" / "325" → "3255"; null for "not in universe" and unemployed/military codes */
export function occCode(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const code = s.padStart(4, '0');
  if (code === '0000' || code === '0009' || code >= '9800') return null;   // N/A, military (98xx), unemployed (9920)
  return code;
}

/**
 * ADJINC as a multiplier. The PUMS files store it with 6 implied decimals
 * (1042311 = 1.042311); the Census API returns it already as a decimal
 * (1.042311). Accept both.
 */
export function adjFactor(adjinc) {
  const n = Number(adjinc);
  if (!(n > 0)) return 1;
  return n > 10 ? n / 1e6 : n;
}

/** Hourly pay in the file's latest-year dollars, or null when it can't be worked out */
export function hourlyPay(wagp, adjinc, wkhp, wkwn) {
  const wage = Number(wagp) * adjFactor(adjinc);
  const hours = Number(wkhp), weeks = Number(wkwn);
  if (!(wage > 0) || !(hours > 0) || !(weeks > 0)) return null;
  return wage / (hours * weeks);
}

export const binOf = (hourly) => Math.min(MAX_BIN, Math.floor(hourly / BIN_WIDTH));

/**
 * One state's running totals. Feed it API chunks with addChunk(); finish()
 * returns the rows to store and the occupation totals for the US figures.
 */
export function newStateTotals() {
  return {
    occ: new Map(),        // occ → acc
    occBin: new Map(),     // `${occ}|${bin}` → acc
    group: new Map(),      // SOC major group → acc
    binWeight: new Float64Array(MAX_BIN + 1),   // PWGTP per pay step (for the band edges)
    people: 0,
  };
}

/**
 * How many employees in answer A have no line in answer B (the two halves of
 * one chunk should list exactly the same people; a short or empty answer from
 * the API breaks that — the import script then asks again).
 */
export function unmatched(rowsA, rowsB) {
  if (!rowsA?.length || rowsA.length < 2) return { employees: 0, missing: 0 };
  const ha = indexOf(rowsA[0]);
  const keys = new Set();
  if (rowsB?.length > 1) {
    const hb = indexOf(rowsB[0]);
    for (let i = 1; i < rowsB.length; i++) keys.add(`${rowsB[i][hb.SERIALNO]}|${rowsB[i][hb.SPORDER]}`);
  }
  let employees = 0, missing = 0;
  for (let i = 1; i < rowsA.length; i++) {
    const a = rowsA[i];
    const cow = Number(a[ha.COW]);
    if (!(cow >= 1 && cow <= 5) || !occCode(a[ha.OCCP])) continue;
    employees++;
    if (!keys.has(`${a[ha.SERIALNO]}|${a[ha.SPORDER]}`)) missing++;
  }
  return { employees, missing };
}

/**
 * rowsA / rowsB: the Census API answers (first row = column names) for the
 * same filter. Returns how many people were added. People missing from B are
 * an error, unless skipMissing (then they're left out and counted in t.skipped).
 */
export function addChunk(t, rowsA, rowsB, { skipMissing = false } = {}) {
  if (!rowsA?.length || rowsA.length < 2) return 0;
  const ha = indexOf(rowsA[0]);
  const hb = rowsB?.length > 1 ? indexOf(rowsB[0]) : null;
  const bByKey = new Map();
  if (hb) for (let i = 1; i < rowsB.length; i++) bByKey.set(`${rowsB[i][hb.SERIALNO]}|${rowsB[i][hb.SPORDER]}`, rowsB[i]);
  const repA = range(1, 39).map((i) => ha[`PWGTP${i}`]);
  const repB = hb ? range(40, 80).map((i) => hb[`PWGTP${i}`]) : [];
  let added = 0;
  const w = new Float64Array(REPS + 1);
  for (let i = 1; i < rowsA.length; i++) {
    const a = rowsA[i];
    const cow = Number(a[ha.COW]);
    if (!(cow >= 1 && cow <= 5)) continue;                     // employees only
    const occ = occCode(a[ha.OCCP]);
    if (!occ) continue;
    const b = bByKey.get(`${a[ha.SERIALNO]}|${a[ha.SPORDER]}`);
    if (!b) {
      if (skipMissing) { t.skipped = (t.skipped ?? 0) + 1; continue; }
      throw new Error(`replicate weights 40–80 missing for person ${a[ha.SERIALNO]}/${a[ha.SPORDER]}`);
    }
    w[0] = Number(a[ha.PWGTP]);
    for (let r = 0; r < 39; r++) w[r + 1] = Number(a[repA[r]]);
    for (let r = 0; r < 41; r++) w[r + 40] = Number(b[repB[r]]);
    const insured = String(a[ha.HINS1]).trim() === '1';
    const socp = String(a[ha.SOCP] ?? '').trim();
    const group = /^\d{2}/.test(socp) ? socp.slice(0, 2) : null;
    const hourly = hourlyPay(a[ha.WAGP], a[ha.ADJINC], a[ha.WKHP], a[ha.WKWN]);

    addPerson(getAcc(t.occ, occ), w, insured);
    if (group && group !== '55') addPerson(getAcc(t.group, group), w, insured);   // 55 = military
    if (hourly != null) {
      const bin = binOf(hourly);
      addPerson(getAcc(t.occBin, `${occ}|${bin}`), w, insured);
      t.binWeight[bin] += w[0];
    }
    added++;
  }
  t.people += added;
  return added;
}

function indexOf(header) {
  const m = {};
  header.forEach((h, i) => { m[h] = i; });
  for (const need of ['SERIALNO', 'SPORDER']) if (m[need] == null) throw new Error(`column ${need} missing in API answer`);
  return m;
}

function getAcc(map, key) {
  let a = map.get(key);
  if (!a) { a = newAcc(); map.set(key, a); }
  return a;
}

/** Weighted 25th / 50th / 75th percentile of hourly pay, as $0.50 step lower bounds */
export function bandEdges(binWeight) {
  const total = binWeight.reduce((s, x) => s + x, 0);
  if (total <= 0) return null;
  const edges = [];
  for (const q of [0.25, 0.5, 0.75]) {
    let cum = 0;
    for (let b = 0; b <= MAX_BIN; b++) {
      cum += binWeight[b];
      if (cum >= q * total) { edges.push((b + 1) * BIN_WIDTH); break; }
    }
  }
  return edges;
}

/** Band 1–4 of a pay step: how many edges are at or below the step's lowest pay, plus one */
export const bandOfBin = (bin, edges) => 1 + edges.filter((e) => e <= bin * BIN_WIDTH).length;

/** Rows for one state + its occupation totals (for the US-wide rows) */
export function finishState(t, state, period) {
  const edges = bandEdges(t.binWeight);
  const rows = [];
  const push = (level, occ, band, acc) => {
    if (acc.n < MIN_N_STORE) return;
    const e = estimate(acc);
    if (e) rows.push({ acs_period: period, level, state, occ, wage_band: band, ...e });
  };
  for (const [occ, acc] of t.occ) push('state_occ', occ, 0, acc);
  for (const [group, acc] of t.group) push('state_group', group, 0, acc);
  if (edges) {
    const bands = new Map();
    for (const [key, acc] of t.occBin) {
      const [occ, bin] = key.split('|');
      const k = `${occ}|${bandOfBin(Number(bin), edges)}`;
      if (!bands.has(k)) bands.set(k, newAcc());
      mergeAcc(bands.get(k), acc);
    }
    for (const [k, acc] of bands) {
      const [occ, band] = k.split('|');
      push('state_occ_band', occ, Number(band), acc);
    }
  }
  return { rows, edges, occTotals: t.occ, people: t.people };
}

/** US-wide rows from every state's occupation totals */
export function usRows(occTotalsList, period) {
  const all = new Map();
  for (const m of occTotalsList) {
    for (const [occ, acc] of m) {
      if (!all.has(occ)) all.set(occ, newAcc());
      mergeAcc(all.get(occ), acc);
    }
  }
  const rows = [];
  for (const [occ, acc] of all) {
    if (acc.n < MIN_N_STORE) continue;
    const e = estimate(acc);
    if (e) rows.push({ acs_period: period, level: 'us_occ', state: 'US', occ, wage_band: 0, ...e });
  }
  return rows;
}
