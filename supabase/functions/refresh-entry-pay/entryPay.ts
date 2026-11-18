/**
 * Entry-level pay per occupation (pure functions, no I/O).
 *
 * "Entry pay" = what people earn in their first year or two in a job — NOT the
 * 25th percentile of everyone's pay (a long-time low earner is poorly paid, not
 * entry level). Four sources, best first (decision 2026-10-19):
 *
 *   graduates_pseo     Census PSEO: median earnings 1 year after graduating from
 *                      a certificate / associate program, per state
 *   graduates_eta      DOL ETA-9171: median earnings in the 2nd quarter after
 *                      leaving a WIOA-approved training program (× 4), per state
 *   new_entrants_cps   Census CPS January supplement (2020, 2022, 2024, 2026):
 *                      full-time employees who were NOT doing this kind of work a
 *                      year earlier (or not working), national
 *   young_fulltime_cps Census CPS monthly: full-time employees aged 18–24 not in
 *                      school, national (fallback; misses older career changers)
 *
 * All dollars are converted to the latest full year with the CPI-U.
 */

export const MIN_N = 30;                  // responses / graduates for a published figure

// ── State codes ──────────────────────────────────────────────────────────────

export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};
const VALID_FIPS = new Set(Object.values(STATE_FIPS));

// ── Weighted median ─────────────────────────────────────────────────────────

export interface Obs { v: number; w: number }

export function weightedMedian(list: Obs[]): number | null {
  const s = list.filter((x) => x.v > 0 && x.w > 0).sort((a, b) => a.v - b.v);
  if (!s.length) return null;
  const total = s.reduce((t, x) => t + x.w, 0);
  let c = 0;
  for (const x of s) { c += x.w; if (c >= total / 2) return x.v; }
  return s[s.length - 1].v;
}

// ── CPI-U (BLS series CUUR0000SA0, annual averages) ─────────────────────────

/** year → factor that converts that year's dollars into `target`-year dollars. */
export function cpiFactors(annual: Map<number, number>): { target: number; factor: (year: number) => number | null } {
  const years = [...annual.keys()].sort((a, b) => a - b);
  if (!years.length) throw new Error('no CPI data');
  const target = years[years.length - 1];
  const t = annual.get(target)!;
  return {
    target,
    factor: (year: number) => {
      const y = Math.min(Math.max(year, years[0]), target);
      const v = annual.get(y);
      return v ? t / v : null;
    },
  };
}

/** BLS API v2 response → year → annual average (period M13). */
export function parseCpi(blsJson: { Results?: { series?: Array<{ data?: Array<{ year: string; period: string; value: string }> }> } }) {
  const out = new Map<number, number>();
  for (const d of blsJson.Results?.series?.[0]?.data ?? []) {
    if (d.period === 'M13') out.set(Number(d.year), Number(d.value));
  }
  return out;
}

// ── Program → occupation mapping (from DOL's own program records) ───────────

export interface CipSocShare { cip4: string; length_class: string; soc: string; share: number }

/** (CIP 4-digit, length class) → occupations that ≥ half of DOL's programs of that kind lead to. */
export function cipSocMap(shares: CipSocShare[], minShare = 0.5) {
  const out = new Map<string, string[]>();
  for (const s of shares) {
    if (Number(s.share) < minShare) continue;
    const k = `${s.cip4}|${s.length_class}`;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(s.soc);
  }
  return out;
}

// ── Census PSEO (pseoe_all.csv) ──────────────────────────────────────────────

// PSEO degree_level: 01 certificate < 1 year, 02 certificate 1–2 years, 03 associate
const PSEO_LEVELS = new Set(['01', '02', '03']);

export interface PseoRow { state: string; cip4: string; level: string; cohort: string; median: number; grads: number }

/** Streams lines of pseoe_all.csv; keeps the newest cohort per (state, program, level). */
export function pseoAccumulator() {
  let ix: Record<string, number> | null = null;
  const best = new Map<string, PseoRow>();
  let lines = 0;
  return {
    add(line: string) {
      if (!line) return;
      const f = line.split(',');
      if (!ix) {
        ix = Object.fromEntries(f.map((h, i) => [h.trim().replace(/^﻿/, ''), i]));
        for (const k of ['inst_level', 'institution', 'degree_level', 'cip_level', 'cipcode', 'grad_cohort', 'y1_p50_earnings', 'y1_grads_earn']) {
          if (!(k in ix)) throw new Error(`PSEO header has no ${k}: ${line.slice(0, 200)}`);
        }
        return;
      }
      lines++;
      if (f[ix.inst_level] !== 'S' || f[ix.cip_level] !== '4' || !PSEO_LEVELS.has(f[ix.degree_level])) return;
      const cohort = f[ix.grad_cohort];
      if (!cohort || cohort === '0000') return;                  // 0000 = all cohorts pooled (2001–)
      const median = Number(f[ix.y1_p50_earnings]), grads = Number(f[ix.y1_grads_earn]);
      if (!(median > 0) || !(grads > 0)) return;
      const state = f[ix.institution].padStart(2, '0');
      const k = `${state}|${f[ix.cipcode]}|${f[ix.degree_level]}`;
      const cur = best.get(k);
      if (!cur || cohort > cur.cohort) {
        best.set(k, { state, cip4: f[ix.cipcode], level: f[ix.degree_level], cohort, median, grads });
      }
    },
    /** Only programs reported for one of the two newest cohorts (PSEO cohorts are 5-year groups). */
    rows: () => {
      const all = [...best.values()];
      const newest = all.reduce((m, r) => (r.cohort > m ? r.cohort : m), '');
      const oldestKept = String(Number(newest) - 5);
      return all.filter((r) => r.cohort >= oldestKept);
    },
    lines: () => lines,
  };
}

export interface EntryRow {
  soc: string; area_code: string; method: string;
  annual: number; n: number; period: string; dollar_year: number; detail: Record<string, unknown>;
}

/**
 * PSEO rows → entry pay per occupation, per state and US: graduate-weighted
 * average of the programs' medians (median of medians is not available).
 */
export function pseoEntryRows(rows: PseoRow[], map: Map<string, string[]>, toOews: (soc: string) => string | null,
  factor: number, dollarYear: number): EntryRow[] {
  const acc = new Map<string, { sum: number; n: number; programs: Set<string>; cohorts: Set<string> }>();
  const add = (soc: string, area: string, r: PseoRow) => {
    const k = `${soc}|${area}`;
    const a = acc.get(k) ?? { sum: 0, n: 0, programs: new Set(), cohorts: new Set() };
    a.sum += r.median * r.grads; a.n += r.grads; a.programs.add(`${r.cip4}/${r.level}`); a.cohorts.add(r.cohort);
    acc.set(k, a);
  };
  for (const r of rows) {
    if (!VALID_FIPS.has(r.state)) continue;
    const socs = new Set((map.get(`${r.cip4}|${r.level}`) ?? []).map(toOews).filter((s): s is string => !!s));
    for (const soc of socs) { add(soc, r.state, r); add(soc, 'US', r); }
  }
  return [...acc.entries()].map(([k, a]) => {
    const [soc, area] = k.split('|');
    const cohorts = [...a.cohorts].sort();
    return {
      soc, area_code: area, method: 'graduates_pseo',
      annual: Math.round((a.sum / a.n) * factor), n: a.n,
      period: `graduates ${cohorts[0]}${cohorts.length > 1 ? '–' + cohorts[cohorts.length - 1] : ''} cohorts, 1st year`,
      dollar_year: dollarYear,
      detail: { programs: [...a.programs].sort(), source_dollar_year: dollarYear, raw: Math.round(a.sum / a.n) },
    };
  });
}

// ── DOL ETA-9171 (training_programs table) ───────────────────────────────────

export interface EtaProgram {
  socs: string[]; state: string | null; median_q2_earnings: number;
  exited: number | null; employed_q2_rate: number | null; reported_at: string | null;
}

export function etaEntryRows(programs: EtaProgram[], toOews: (soc: string) => string | null,
  factor: (year: number) => number | null, targetYear: number, minYear: number): EntryRow[] {
  const acc = new Map<string, { obs: Obs[]; n: number; programs: number; years: Set<number> }>();
  for (const p of programs) {
    const year = Number((p.reported_at ?? '').slice(0, 4));
    if (!(year >= minYear) || !(p.median_q2_earnings > 0)) continue;
    const f = factor(year);
    if (!f) continue;
    const employed = Math.round((p.exited ?? 0) * (p.employed_q2_rate ?? 1));
    if (employed < 1) continue;
    const v = p.median_q2_earnings * 4 * f;                 // a quarter's earnings → a year
    const areas = ['US'];
    const fips = p.state ? STATE_FIPS[p.state.toUpperCase()] : undefined;
    if (fips) areas.push(fips);
    for (const soc of new Set(p.socs.map(toOews).filter((s): s is string => !!s))) {
      for (const area of areas) {
        const k = `${soc}|${area}`;
        const a = acc.get(k) ?? { obs: [], n: 0, programs: 0, years: new Set() };
        a.obs.push({ v, w: employed }); a.n += employed; a.programs++; a.years.add(year);
        acc.set(k, a);
      }
    }
  }
  const out: EntryRow[] = [];
  for (const [k, a] of acc) {
    const m = weightedMedian(a.obs);
    if (m == null) continue;
    const [soc, area] = k.split('|');
    const ys = [...a.years].sort();
    out.push({
      soc, area_code: area, method: 'graduates_eta', annual: Math.round(m), n: a.n,
      period: `reported ${ys[0]}${ys.length > 1 ? '–' + ys[ys.length - 1] : ''}`, dollar_year: targetYear,
      detail: { programs: a.programs },
    });
  }
  return out;
}

// ── Census CPS ───────────────────────────────────────────────────────────────

/**
 * Census API rows (header first) → weekly earnings per Census occupation.
 * `keep` decides which responses count (new entrants, or young workers).
 * Rows must hold PTERNWA, PWORWGT, PTIO1OCD, PRCOW1.
 */
export function addCpsRows(acc: Map<string, Obs[]>, rows: string[][], factor: number,
  keep: (get: (name: string) => string) => boolean) {
  const [head, ...body] = rows;
  const ix = new Map(head.map((h, i) => [h, i]));
  const col = (name: string) => {
    const i = ix.get(name);
    if (i == null) throw new Error(`CPS response has no ${name}`);
    return i;
  };
  const iE = col('PTERNWA'), iW = col('PWORWGT'), iO = col('PTIO1OCD'), iK = col('PRCOW1');
  let used = 0;
  for (const r of body) {
    const e = Number(r[iE]), w = Number(r[iW]), cls = Number(r[iK]);
    if (!(e > 0) || !(w > 0) || !(cls >= 1 && cls <= 4)) continue;   // employees with earnings
    if (!keep((name) => r[col(name)])) continue;
    const occ = String(r[iO]).padStart(4, '0');
    if (!acc.has(occ)) acc.set(occ, []);
    acc.get(occ)!.push({ v: e * 52 * factor, w });                  // full-time weekly → yearly
    used++;
  }
  return used;
}

/** Not doing this kind of work a year ago (PEST20 = 2), or not working a year ago (PEST8 = 2). */
export const isNewEntrant = (get: (name: string) => string) => get('PEST20') === '2' || get('PEST8') === '2';

/** Aged 18–24 and not enrolled in school. */
export const isYoungNotInSchool = (get: (name: string) => string) => {
  const age = Number(get('PRTAGE'));
  return age >= 18 && age <= 24 && get('PESCHENR') !== '1';
};

export interface CensusOcc { census_code: string; soc: string; soc_like: string | null }

/** For each OEWS occupation, the most specific Census occupation that covers it. */
export function censusCodeFor(socs: string[], census: CensusOcc[]) {
  const like = (soc: string, pattern: string) =>
    pattern.length === soc.length && [...pattern].every((ch, i) => ch === '_' || ch === soc[i]);
  const out = new Map<string, string>();
  for (const soc of socs) {
    let best: { code: string; score: number } | null = null;
    for (const c of census) {
      const score = c.soc === soc ? 100 : (c.soc_like && like(soc, c.soc_like) ? c.soc_like.replace(/_/g, '').length : -1);
      if (score >= 0 && (!best || score > best.score)) best = { code: c.census_code, score };
    }
    if (best) out.set(soc, best.code);
  }
  return out;
}

export function cpsEntryRows(acc: Map<string, Obs[]>, socToCensus: Map<string, string>, method: string,
  period: string, dollarYear: number, minN = MIN_N): EntryRow[] {
  const byCensus = new Map<string, { median: number; n: number }>();
  for (const [code, obs] of acc) {
    if (obs.length < minN) continue;
    const m = weightedMedian(obs);
    if (m != null) byCensus.set(code, { median: Math.round(m), n: obs.length });
  }
  const out: EntryRow[] = [];
  for (const [soc, code] of socToCensus) {
    const g = byCensus.get(code);
    if (!g) continue;
    out.push({ soc, area_code: 'US', method, annual: g.median, n: g.n, period, dollar_year: dollarYear, detail: { census_code: code } });
  }
  return out;
}
