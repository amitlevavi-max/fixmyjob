/**
 * Pay of certified vs uncertified workers, per Census occupation, from
 * Current Population Survey microdata (pure functions, no I/O).
 *
 * Input rows: one per survey response from the Census Data API
 *   PTERNWA  weekly earnings (dollars; only asked in outgoing-rotation months)
 *   PWORWGT  outgoing-rotation weight
 *   PECERT1  1 = has an active professional certification or license, 2 = no
 *   PTIO1OCD Census 2018 occupation code of the main job
 *   PRCOW1   class of worker: 1–4 = government or private employee
 * Already filtered by the API to employed (PEMLR=1) full-time (PRFTLF=1).
 */

export interface Obs { e: number; w: number }
export interface Groups { cert: Obs[]; none: Obs[] }

export const MIN_RESPONSES = 100;   // per group, for a published figure
const Z = 1.96;                     // 95% range (people answer in two years, so be conservative)

/** Turn Census API rows (header first) into per-occupation groups. */
export function addRows(acc: Map<string, Groups>, rows: string[][]) {
  const [head, ...body] = rows;
  const ix = (k: string) => head.indexOf(k);
  const iE = ix('PTERNWA'), iW = ix('PWORWGT'), iC = ix('PECERT1'), iO = ix('PTIO1OCD'), iK = ix('PRCOW1');
  let used = 0;
  for (const r of body) {
    const e = Number(r[iE]), w = Number(r[iW]), cls = Number(r[iK]);
    if (!(e > 0) || !(w > 0) || !(cls >= 1 && cls <= 4)) continue;
    const c = r[iC];
    if (c !== '1' && c !== '2') continue;
    const occ = String(r[iO]).padStart(4, '0');
    let g = acc.get(occ);
    if (!g) { g = { cert: [], none: [] }; acc.set(occ, g); }
    (c === '1' ? g.cert : g.none).push({ e, w });
    used++;
  }
  return used;
}

/** Weighted quantile (p in 0..1) of a list sorted by e. */
function wq(sorted: Obs[], total: number, p: number) {
  const target = total * Math.min(1, Math.max(0, p));
  let c = 0;
  for (const x of sorted) { c += x.w; if (c >= target) return x.e; }
  return sorted[sorted.length - 1].e;
}

/**
 * Median and its standard error from order statistics:
 * the median's 95% range sits at quantiles 0.5 ± Z·0.5/√n.
 */
function medianWithSe(list: Obs[]) {
  const s = [...list].sort((a, b) => a.e - b.e);
  const total = s.reduce((t, x) => t + x.w, 0);
  const half = (Z * 0.5) / Math.sqrt(s.length);
  const lo = wq(s, total, 0.5 - half), hi = wq(s, total, 0.5 + half);
  return { median: wq(s, total, 0.5), se: (hi - lo) / (2 * Z) };
}

export interface Gap {
  n_cert: number; n_none: number;
  weekly_cert: number | null; weekly_none: number | null;
  gap_low: number | null; gap_high: number | null;
  reliable: boolean;
}

export function gapFor(g: Groups): Gap {
  const out: Gap = {
    n_cert: g.cert.length, n_none: g.none.length,
    weekly_cert: null, weekly_none: null, gap_low: null, gap_high: null, reliable: false,
  };
  if (g.cert.length < 30 || g.none.length < 30) return out;   // too few to say anything
  const a = medianWithSe(g.cert), b = medianWithSe(g.none);
  const gap = a.median - b.median;
  const se = Math.sqrt(a.se ** 2 + b.se ** 2);
  out.weekly_cert = Math.round(a.median);
  out.weekly_none = Math.round(b.median);
  out.gap_low = Math.round(gap - Z * se);
  out.gap_high = Math.round(gap + Z * se);
  out.reliable = g.cert.length >= MIN_RESPONSES && g.none.length >= MIN_RESPONSES && out.gap_low > 0;
  return out;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The `count` calendar months before `from` (newest first), as {year, mon, label}. */
export function monthsBefore(from: Date, count: number) {
  const out: Array<{ year: number; mon: string; label: string }> = [];
  let y = from.getUTCFullYear(), m = from.getUTCMonth();   // start with the previous month
  for (let i = 0; i < count; i++) {
    m--; if (m < 0) { m = 11; y--; }
    out.push({ year: y, mon: MONTHS[m], label: `${y}-${String(m + 1).padStart(2, '0')}` });
  }
  return out;
}
