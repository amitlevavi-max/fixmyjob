/**
 * Related work experience needed to be hired into an occupation, from O*NET
 * (U.S. Dept. of Labor / ETA, CC BY 4.0), imported into `occupation_experience`
 * by the refresh-benchmarks function.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { t, isSpanish } from '../i18n';

/** O*NET Related Work Experience categories 1–11 as year ranges */
const BANDS: Array<{ low: number; high: number | null; label: string }> = [
  { low: 0, high: 0, label: 'No related experience' },
  { low: 0, high: 1 / 12, label: 'Up to 1 month' },
  { low: 1 / 12, high: 0.25, label: '1–3 months' },
  { low: 0.25, high: 0.5, label: '3–6 months' },
  { low: 0.5, high: 1, label: '6–12 months' },
  { low: 1, high: 2, label: '1–2 years' },
  { low: 2, high: 4, label: '2–4 years' },
  { low: 4, high: 6, label: '4–6 years' },
  { low: 6, high: 8, label: '6–8 years' },
  { low: 8, high: 10, label: '8–10 years' },
  { low: 10, high: null, label: 'More than 10 years' },
];

/**
 * When answers cluster around two separate periods (e.g. 2–4 years AND 8–10
 * years for school administrators), both are shown: the earlier one is the
 * "fast track"; the later one is "typical" if at least as many people gave it,
 * otherwise the "longer track".
 */
export interface ExperienceTrack {
  kind: 'fast' | 'typical' | 'longer';
  name: string;               // 'Fast track'
  low: number;
  high: number | null;
  label: string;              // '2–4 years'
  sharePct: number;           // share of answers in this cluster
}

const PEAK_MIN = 15;          // a category needs ≥15% of answers to be a peak
const CLUSTER_MIN = 20;       // each track must hold ≥20% of answers

function rangeLabel(a: number, b: number) {
  if (a === b) return BANDS[a].label;
  const lo = BANDS[a], hi = BANDS[b];
  const fmt = (y: number) => (y < 1 ? `${Math.round(y * 12)} months` : `${y}`);
  if (hi.high == null) return `${fmt(lo.low)}+ years`;
  return lo.low < 1 && hi.high < 1 ? `${Math.round(lo.low * 12)}–${Math.round(hi.high * 12)} months` : `${fmt(lo.low)}–${hi.high} years`;
}

/** Two separate clusters in the answers, or null when there's one main period. */
export function findTracks(dist: number[]): ExperienceTrack[] | null {
  if (!Array.isArray(dist) || dist.length !== 11) return null;
  const d = dist.map((v) => Number(v) || 0);
  const peaks = d
    .map((v, i) => ({ v, i }))
    .filter(({ v, i }) => v >= PEAK_MIN && v >= (d[i - 1] ?? 0) && v >= (d[i + 1] ?? 0))
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .sort((a, b) => a.i - b.i);
  if (peaks.length < 2) return null;
  const [p, q] = peaks;
  // There must be a real dip between them
  const valley = Math.min(...d.slice(p.i + 1, q.i));
  if (q.i - p.i < 2 || valley >= 0.5 * Math.min(p.v, q.v)) return null;
  // Grow each cluster to neighbours with at least half the peak's share (not past the dip)
  const grow = (pk: { v: number; i: number }, min: number, max: number) => {
    let a = pk.i, b = pk.i;
    while (a - 1 >= min && d[a - 1] >= pk.v / 2) a--;
    while (b + 1 <= max && d[b + 1] >= pk.v / 2) b++;
    return { a, b, share: d.slice(a, b + 1).reduce((s, v) => s + v, 0) };
  };
  const dip = d.indexOf(valley, p.i + 1);
  const A = grow(p, 0, dip - 1), B = grow(q, dip + 1, 10);
  if (A.share < CLUSTER_MIN || B.share < CLUSTER_MIN) return null;
  const later: ExperienceTrack['kind'] = B.share >= A.share ? 'typical' : 'longer';
  return [
    { kind: 'fast', name: 'Fast track', low: BANDS[A.a].low, high: BANDS[A.b].high, label: rangeLabel(A.a, A.b), sharePct: Math.round(A.share) },
    { kind: later, name: later === 'typical' ? 'Typical' : 'Longer track', low: BANDS[B.a].low, high: BANDS[B.b].high, label: rangeLabel(B.a, B.b), sharePct: Math.round(B.share) },
  ];
}

export interface ExperienceNeeded {
  /** Typical answer (median category) as a year range */
  low: number;
  high: number | null;
  label: string;
  /** The middle half of answers, e.g. "1–2 years to 4–6 years" spans */
  rangeLow: number;
  rangeHigh: number | null;
  none: boolean;              // typically no related experience needed
  /** Two separate clusters (fast track + typical/longer), or null */
  tracks: ExperienceTrack[] | null;
  lowPrecision: boolean;
  sourceLabel: string;        // "O*NET 31.0, U.S. Dept. of Labor"
}

const cache = new Map<string, ExperienceNeeded | null>();

export async function fetchExperience(soc: string): Promise<ExperienceNeeded | null> {
  if (cache.has(soc)) return cache.get(soc)!;
  const { data, error } = await supabase.from('occupation_experience')
    .select('median_cat, p25_cat, p75_cat, low_precision, onet_version, dist').eq('soc', soc).maybeSingle();
  if (error) return null;                       // table not created yet / offline — don't cache
  const out = data ? toExperience(data) : null;
  cache.set(soc, out);
  return out;
}

function toExperience(r: { median_cat: number; p25_cat: number; p75_cat: number; low_precision: boolean; onet_version: string | null; dist?: number[] | null }): ExperienceNeeded {
  const m = BANDS[Math.min(10, Math.max(0, r.median_cat - 1))];
  const lo = BANDS[Math.min(10, Math.max(0, r.p25_cat - 1))];
  const hi = BANDS[Math.min(10, Math.max(0, r.p75_cat - 1))];
  return {
    low: m.low, high: m.high, label: m.label,
    rangeLow: lo.low, rangeHigh: hi.high,
    none: r.median_cat === 1,
    tracks: r.dist ? findTracks(r.dist) : null,
    lowPrecision: !!r.low_precision,
    sourceLabel: `O*NET${r.onet_version ? ` ${r.onet_version}` : ''}, U.S. Dept. of Labor`,
  };
}

export function useExperience(soc: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; data: ExperienceNeeded | null }>({ loading: !!soc, data: null });
  useEffect(() => {
    let alive = true;
    if (!soc) { setState({ loading: false, data: null }); return; }
    setState({ loading: true, data: null });
    fetchExperience(soc).then((data) => { if (alive) setState({ loading: false, data }); });
    return () => { alive = false; };
  }, [soc]);
  return state;
}

/** An experience label ("2–4 years", "6 months–1 year") in the current language */
export function experienceLabel(label: string): string {
  if (!isSpanish()) return label;
  const whole = t(label);
  if (whole !== label) return whole;
  return label.replace(/\byears?\b/g, 'años').replace(/\bmonths?\b/g, 'meses');
}
