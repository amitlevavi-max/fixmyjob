/**
 * Two official data sets behind certification opportunities:
 *
 *  - Pay of certified vs uncertified workers in the same job — U.S. Census
 *    Bureau, Current Population Survey (table cert_pay_gaps, filled yearly by
 *    the refresh-cert-pay Edge Function). It's a comparison between peers, not
 *    proof that a certificate causes the difference, and the survey doesn't say
 *    WHICH certificate — the app says "with a certification or license".
 *
 *  - Approved training programs with their published results — U.S. Dept. of
 *    Labor, ETA-9171 (TrainingProviderResults.gov), table training_programs.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { SEARCH_RADIUS_MI } from './home';

export const CERT_PAY_SOURCE = 'US Census Bureau';
export const TRAINING_SOURCE = 'US Dept. of Labor, approved training programs';

export interface CertPayGap {
  censusTitle: string;            // 'Electricians'
  nCert: number;
  nNone: number;
  weeklyCert: number | null;
  weeklyNone: number | null;
  /** Yearly difference range (weekly × 52), 95% */
  yearlyLow: number | null;
  yearlyHigh: number | null;
  /** Lower end of the range as a % of uncertified pay (used to scale to the user's pay) */
  pctLow: number | null;
  reliable: boolean;              // enough answers in both groups and the range is above zero
  period: string;                 // '2024-09 to 2026-08'
}

const gapCache = new Map<string, CertPayGap | null>();

export async function fetchCertPayGap(soc: string): Promise<CertPayGap | null> {
  if (gapCache.has(soc)) return gapCache.get(soc)!;
  const { data, error } = await supabase.rpc('cert_pay_gap', { p_soc: soc });
  if (error) return null;                               // not deployed yet / offline — don't cache
  const r = (data ?? [])[0];
  const out: CertPayGap | null = r ? {
    censusTitle: r.census_title,
    nCert: r.n_cert, nNone: r.n_none,
    weeklyCert: r.weekly_cert == null ? null : Number(r.weekly_cert),
    weeklyNone: r.weekly_none == null ? null : Number(r.weekly_none),
    yearlyLow: r.gap_low == null ? null : Math.round((Number(r.gap_low) * 52) / 100) * 100,
    yearlyHigh: r.gap_high == null ? null : Math.round((Number(r.gap_high) * 52) / 100) * 100,
    pctLow: r.gap_low != null && r.weekly_none ? (Number(r.gap_low) / Number(r.weekly_none)) * 100 : null,
    reliable: !!r.reliable,
    period: `${r.period_from} to ${r.period_to}`,
  } : null;
  gapCache.set(soc, out);
  return out;
}

export function useCertPayGap(soc: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; data: CertPayGap | null }>({ loading: !!soc, data: null });
  useEffect(() => {
    let alive = true;
    if (!soc) { setState({ loading: false, data: null }); return; }
    setState({ loading: true, data: null });
    fetchCertPayGap(soc).then((data) => { if (alive) setState({ loading: false, data }); });
    return () => { alive = false; };
  }, [soc]);
  return state;
}

/** The user's yearly gain: the LOW end of the peer gap, as a % of their own pay. */
export function certGainFor(gap: CertPayGap | null, annualEarnings: number): number {
  if (!gap?.reliable || gap.pctLow == null || gap.pctLow <= 0) return 0;
  const base = annualEarnings > 0 ? annualEarnings : (gap.weeklyNone ?? 0) * 52;
  return Math.round((base * gap.pctLow) / 100 / 100) * 100;
}

// ── Training programs ───────────────────────────────────────────────────────

export interface TrainingProgram {
  id: string;
  provider: string;
  name: string;
  credential: string | null;
  cip_title: string | null;
  state: string | null;
  city: string | null;
  format: 'in_person' | 'online' | 'hybrid' | 'mixed' | null;
  url: string | null;
  tuition: number | null;
  supplies: number | null;
  weeks: number | null;
  exited: number | null;
  completion_rate: number | null;
  employed_q2_rate: number | null;
  employed_q4_rate: number | null;
  median_q2_earnings: number | null;     // quarterly
  credential_rate: number | null;
  reported_at: string | null;
  distance_mi?: number | null;            // straight line from the user's ZIP
}

export interface TrainingOptions {
  scope: 'nearby' | 'state' | 'online';  // nearby = within radius of the user's ZIP; online = nothing in the state
  summary: {
    in_state: number; nationwide: number; radius_mi?: number | null;
    median_weeks: number | null; median_tuition: number | null; median_completion: number | null;
    with_results: number;
  };
  programs: TrainingProgram[];
}

export async function fetchTrainingOptions(
  soc: string, state: string | null, point?: { lat: number; lon: number } | null,
): Promise<TrainingOptions | null> {
  const call = (p_state: string | null, p_limit: number, near?: { lat: number; lon: number } | null) =>
    supabase.rpc('training_options', {
      p_soc: soc, p_state, p_limit, ...(near ? { p_lat: near.lat, p_lon: near.lon, p_radius: SEARCH_RADIUS_MI } : {}),
    });
  // Within ~50 miles of the user's ZIP or metro first (crosses state lines)
  if (point) {
    const near = await call(state, 8, point);
    if (!near.error && near.data && (near.data.programs ?? []).length) {
      return { scope: 'nearby', summary: near.data.summary, programs: near.data.programs };
    }
  }
  const { data, error } = await call(state, 8);
  if (error || !data) return null;
  if ((data.programs ?? []).length > 0 || !state) {
    return { scope: 'state', summary: data.summary, programs: data.programs ?? [] };
  }
  // Nothing in the user's state → online programs from anywhere
  const all = await call(null, 50);
  if (all.error || !all.data) return null;
  const online = (all.data.programs as TrainingProgram[]).filter((p) => p.format === 'online').slice(0, 8);
  return { scope: 'online', summary: { ...data.summary, nationwide: all.data.summary.nationwide }, programs: online };
}

/** The `certGap` context personalizeGain() expects: null while loading, 'none' when there's no data. */
export function useCertGapContext(soc: string | null | undefined, annualEarnings: number) {
  const { loading, data } = useCertPayGap(soc);
  if (!soc) return 'none' as const;
  if (loading) return null;
  if (!data) return 'none' as const;
  return {
    gain: certGainFor(data, annualEarnings),
    title: data.censusTitle,
    yearlyLow: data.yearlyLow,
    yearlyHigh: data.yearlyHigh,
    reliable: data.reliable,
    period: data.period,
  };
}
