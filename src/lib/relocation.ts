/**
 * "Where does my job pay more?" — wages for the user's occupation in every
 * state and metro area (BLS OEWS), weighed against cost of living (BEA
 * Regional Price Parities, US = 100).
 *
 * Real value of a wage = wage × (your price level ÷ their price level),
 * i.e. what that paycheck would buy where you live now.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useUserStore } from '../store/userStore';
import { STATE_FIPS } from './benchmarks';

export interface Place {
  type: 'national' | 'state' | 'metro';
  code: string;
  name: string;            // 'New York-Newark-Jersey City, NY-NJ'
  short: string;           // 'New York'
  states: string[];        // ['NY', 'NJ']
  rural: boolean;          // BLS non-metropolitan area
  p50: number;
  p25: number | null;
  p75: number | null;
  jobs: number | null;     // people employed in this occupation there
  period: string;
  rpp: number | null;      // price level, US = 100
  rppYear: string | null;
}

export interface WageMap {
  national: Place | null;
  states: Place[];
  metros: Place[];
  loading: boolean;
  /** Fetching metro wages from BLS for this occupation (first time only) */
  filling: boolean;
  error: string | null;
}

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

async function loadMap(soc: string): Promise<Place[]> {
  const { data, error } = await supabase.rpc('wage_map', { p_soc: soc });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    type: r.area_type,
    code: r.area_code,
    name: r.name,
    short: r.short_name,
    states: r.state_abbrs ?? [],
    rural: !!r.is_nonmetro,
    p50: Number(r.p50),
    p25: num(r.p25),
    p75: num(r.p75),
    jobs: num(r.employment),
    period: String(r.period ?? ''),
    rpp: num(r.rpp),
    rppYear: r.rpp_year ?? null,
  }));
}

const cache = new Map<string, Place[]>();
const filled = new Set<string>();   // on-demand fill already requested this session

/** All places for one occupation; fills metro wages on demand the first time. */
export function useWageMap(soc: string | null | undefined, { fill = false } = {}): WageMap {
  const [places, setPlaces] = useState<Place[]>(() => (soc && cache.get(soc)) || []);
  const [loading, setLoading] = useState(!!soc && !cache.has(soc));
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!soc) { setPlaces([]); setLoading(false); return; }
    (async () => {
      try {
        let rows = cache.get(soc) ?? await loadMap(soc);
        if (!alive) return;
        cache.set(soc, rows); setPlaces(rows); setLoading(false);

        // No metro data yet → ask the server to fetch it from BLS (once)
        const metros = rows.filter((r) => r.type === 'metro').length;
        if (fill && metros < 50 && !filled.has(soc)) {
          filled.add(soc);
          setFilling(true);
          const { error: fnErr } = await supabase.functions.invoke('refresh-benchmarks', { body: { job: 'explore', soc } });
          if (fnErr) throw new Error('Couldn\'t load city wages right now — try again later.');
          rows = await loadMap(soc);
          if (!alive) return;
          cache.set(soc, rows); setPlaces(rows);
        }
      } catch (e: any) {
        if (alive) setError(e?.message ?? 'Couldn\'t load wages');
      } finally {
        if (alive) { setLoading(false); setFilling(false); }
      }
    })();
    return () => { alive = false; };
  }, [soc, fill]);

  return useMemo(() => ({
    national: places.find((p) => p.type === 'national') ?? null,
    states: places.filter((p) => p.type === 'state'),
    metros: places.filter((p) => p.type === 'metro'),
    loading, filling, error,
  }), [places, loading, filling, error]);
}

// ── Where the user is now ────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Match the user's picked metro ("Newark / Jersey City") to a BLS metro area. */
export function findHomeMetro(metros: Place[], state: string | null, metroName: string | null): Place | null {
  if (!state || !metroName) return null;
  const inState = metros.filter((m) => !m.rural && m.states.includes(state));
  const tokens = metroName.split('/').map((t) => norm(t.replace(/\bcity\b/i, ''))).filter(Boolean);
  for (const t of tokens) {
    const hit = inState.find((m) => norm(m.name).includes(t));
    if (hit) return hit;
  }
  return null;
}

export interface Home {
  /** Price level where the user lives (US = 100) */
  rpp: number;
  /** Typical pay for this occupation where the user lives */
  median: number | null;
  label: string;
  place: Place | null;
}

export function homeOf(map: WageMap, state: string | null, metroName: string | null, isMetro: boolean | null): Home {
  const metro = isMetro ? findHomeMetro(map.metros, state, metroName) : null;
  const st = state ? map.states.find((s) => s.code === STATE_FIPS[state]) ?? null : null;
  const place = metro ?? st ?? map.national;
  return {
    rpp: metro?.rpp ?? st?.rpp ?? 100,
    median: place?.p50 ?? null,
    label: metro?.short ?? st?.short ?? 'the US',
    place,
  };
}

/** What a wage there is worth in the user's home prices. */
export const realValue = (p: Place, home: Home) => (p.rpp ? Math.round(p.p50 * (home.rpp / p.rpp)) : p.p50);

// ── Recommendations ─────────────────────────────────────────────────────────

export interface Recommendation {
  place: Place;
  /** Pay there in home-price terms */
  real: number;
  /** Real pay difference vs. the typical worker where the user lives (%) —
   *  the part of the gain that comes from the place itself */
  realPct: number;
  /** Typical pay there (in home prices) vs. the user's own pay (%) */
  vsYouPct: number | null;
  /** Typical pay there (in home prices) minus the user's pay, per year */
  gainForYou: number;
  /** Price level there vs. home: +12 = 12% pricier */
  costPct: number | null;
}

const MIN_JOBS = 300;   // skip tiny job markets

/**
 * 3–5 places where the same job pays more after cost of living.
 * A place qualifies only if its typical pay beats typical pay where the user
 * lives (so we never suggest moving just because the user is underpaid
 * locally); the gain shown is against the user's own pay.
 */
export function recommendPlaces(
  map: WageMap, home: Home, annualPay: number,
  opts: { onlyState?: string | null; limit?: number } = {},
): Recommendation[] {
  if (!home.median) return [];
  const homeCode = home.place?.code;
  const pool = map.metros.length >= 20
    ? map.metros.filter((m) => !m.rural && (m.jobs ?? 0) >= MIN_JOBS)
    : map.states;                                     // metros not loaded yet → states
  const recs = pool
    .filter((p) => p.code !== homeCode)
    .filter((p) => !opts.onlyState || p.states.includes(opts.onlyState))
    .map((place) => {
      const real = realValue(place, home);
      const ratio = real / home.median!;
      return {
        place, real,
        realPct: Math.round((ratio - 1) * 100),
        vsYouPct: annualPay > 0 ? Math.round((real / annualPay - 1) * 100) : null,
        gainForYou: annualPay > 0 ? Math.max(0, Math.round((real - annualPay) / 100) * 100) : 0,
        costPct: place.rpp ? Math.round((place.rpp / home.rpp - 1) * 100) : null,
      };
    })
    .filter((r) => r.realPct >= 5)
    .sort((a, b) => b.real - a.real);
  return recs.slice(0, opts.limit ?? 5);
}

/** The best real gain for this user, for the opportunity card and summary. */
export function useRelocationGain() {
  const { matchedOccupation, profile, locationState, locationMetro, locationIsMetro } = useUserStore();
  const map = useWageMap(matchedOccupation?.soc);
  return useMemo(() => {
    if (!matchedOccupation || map.loading) return { gain: 0, top: null as Recommendation | null, ready: false };
    const home = homeOf(map, locationState, locationMetro, locationIsMetro);
    const [top] = recommendPlaces(map, home, profile.annualEarnings ?? 0, { limit: 1 });
    return { gain: top?.gainForYou ?? 0, top: top ?? null, ready: true };
  }, [map, matchedOccupation, profile.annualEarnings, locationState, locationMetro, locationIsMetro]);
}

/** Job search link for this occupation in a place. */
export function jobSearchUrl(query: string, place: Place) {
  const where = place.type === 'metro' ? `${place.short}, ${place.states[0]}` : place.name;
  return `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(where)}`;
}
