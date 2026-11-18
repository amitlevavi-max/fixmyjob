/**
 * Occupation search across every occupation BLS publishes (~830) and ~57k
 * everyday job titles from O*NET, via the `search_occupations` database
 * function. Falls back to the occupations bundled in the app when offline or
 * before the catalogue has been imported.
 */

import { supabase } from './supabase';
import {
  OCCUPATIONS, OccupationWages, ALL_OCCUPATIONS_BENCHMARK,
  rankOccupations, confidentMatch,
} from '../data/blsOews';

export interface OccupationHit {
  occ: OccupationWages;
  /** 0–1 for database hits (1 = exact title); keyword score for local hits */
  score: number;
  /** Everyday title that matched, e.g. "Front Desk Agent" (database hits only) */
  matchedTitle?: string;
  /** National median came from live BLS data (false = bundled/estimate) */
  hasLiveWages: boolean;
  /** Suggested by AI from the user's own words (word search found nothing close) */
  suggested?: boolean;
}

export interface OccupationSearchResult {
  source: 'db' | 'local';
  hits: OccupationHit[];
}

// Every occupation we've seen this session, so a chosen SOC can be looked up
// synchronously later (bundled ones are always known).
const known = new Map<string, OccupationWages>(OCCUPATIONS.map((o) => [o.soc, o]));

/** An occupation by SOC if bundled or already seen in a search this session. */
export function knownOccupation(soc?: string | null): OccupationWages | null {
  return soc ? known.get(soc) ?? null : null;
}

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Build an OccupationWages from a DB row: live national wages → bundled → all-occupations shape. */
function toWages(row: { soc: string; title: string; p10?: unknown; p25?: unknown; p50?: unknown; p75?: unknown; p90?: unknown }) {
  const bundled = OCCUPATIONS.find((o) => o.soc === row.soc);
  const p50 = num(row.p50);
  if (p50) {
    const base = bundled ?? ALL_OCCUPATIONS_BENCHMARK;
    const scale = p50 / base.p50;          // fill suppressed percentiles from a similar shape
    const occ: OccupationWages = {
      soc: row.soc,
      title: row.title,
      keywords: bundled?.keywords ?? [],
      p10: num(row.p10) ?? Math.round(base.p10 * scale),
      p25: num(row.p25) ?? Math.round(base.p25 * scale),
      p50,
      p75: num(row.p75) ?? Math.round(base.p75 * scale),
      p90: num(row.p90) ?? Math.round(base.p90 * scale),
    };
    return { occ, live: true };
  }
  if (bundled) return { occ: bundled, live: false };
  const a = ALL_OCCUPATIONS_BENCHMARK;
  return {
    occ: { soc: row.soc, title: row.title, keywords: [], p10: a.p10, p25: a.p25, p50: a.p50, p75: a.p75, p90: a.p90 },
    live: false,
  };
}

function localSearch(q: string, limit: number): OccupationSearchResult {
  return {
    source: 'local',
    hits: rankOccupations(q, limit).map((r) => ({ occ: r.occ, score: r.score, hasLiveWages: false })),
  };
}

/** Below this, the word search hasn't really understood the text — ask the AI. */
const WEAK_MATCH = 0.6;

/**
 * AI reading of free text ("nurse in an old people's home") → up to 4
 * official occupations (match-occupation Edge Function). Always offered for
 * the user to pick — never chosen automatically.
 */
async function suggestOccupations(text: string): Promise<OccupationHit[]> {
  try {
    const { data, error } = await supabase.functions.invoke('match-occupation', { body: { text } });
    if (error || !Array.isArray(data?.matches)) return [];
    const occs = await Promise.all(
      data.matches.map((m: { soc: string }) => fetchOccupationBySoc(m.soc).catch(() => null)),
    );
    return occs
      .filter((o): o is OccupationWages => !!o)
      .map((occ) => ({ occ, score: 0.7, hasLiveWages: true, suggested: true }));
  } catch {
    return [];
  }
}

const searchCache = new Map<string, Promise<OccupationSearchResult>>();

/** Best-matching occupations for free text (best first). */
export function searchOccupations(text: string, limit = 6): Promise<OccupationSearchResult> {
  const q = (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return Promise.resolve({ source: 'local', hits: [] });
  const key = `${q}|${limit}`;
  if (!searchCache.has(key)) {
    const p = (async (): Promise<OccupationSearchResult> => {
      const { data, error } = await supabase.rpc('search_occupations', { q, lim: limit });
      if (error || !Array.isArray(data)) throw new Error(error?.message ?? 'no data');
      if (!data.length) {
        // Catalogue not imported yet → use what's bundled; otherwise "no match" is a real answer
        const { count } = await supabase.from('occupations').select('soc', { count: 'exact', head: true });
        if (!count) return localSearch(q, limit);
      }
      let hits: OccupationHit[] = data.map((r: any) => {
          const { occ, live } = toWages(r);
          known.set(occ.soc, occ);
          const matched = String(r.matched_title ?? '');
          return {
            occ,
            score: Number(r.score) || 0,
            matchedTitle: matched && matched.toLowerCase() !== occ.title.toLowerCase() ? matched : undefined,
            hasLiveWages: live,
          };
        });
      // The words didn't match anything well → let the AI read them
      if (!hits.length || hits[0].score < WEAK_MATCH) {
        const ai = await suggestOccupations(text);
        if (ai.length) {
          const seen = new Set(ai.map((h) => h.occ.soc));
          hits = [...ai, ...hits.filter((h) => !seen.has(h.occ.soc))].slice(0, limit);
        }
      }
      return { source: 'db', hits };
    })().catch(() => {
      searchCache.delete(key);             // retry next time (e.g. was offline)
      return localSearch(q, limit);
    });
    searchCache.set(key, p);
  }
  return searchCache.get(key)!;
}

/**
 * The occupation to use without asking, or null when the user should pick.
 * Database: a strong match (≥0.75) with a clear lead (≥0.15) over the runner-up.
 */
export async function confidentOccupation(text: string): Promise<OccupationWages | null> {
  const res = await searchOccupations(text, 6);
  if (res.source === 'local') return confidentMatch(text);
  const [a, b] = res.hits;
  if (!a || a.score < 0.75) return null;
  if (b && a.score - b.score < 0.15) return null;
  return a.occ;
}

/** Look up any occupation by SOC (e.g. one saved on the user's profile). */
export async function fetchOccupationBySoc(soc?: string | null): Promise<OccupationWages | null> {
  if (!soc) return null;
  const hit = known.get(soc);
  if (hit) return hit;
  try {
    const [{ data: occ }, { data: wage }] = await Promise.all([
      supabase.from('occupations').select('soc, title').eq('soc', soc).maybeSingle(),
      supabase.from('latest_wage_benchmarks').select('p10, p25, p50, p75, p90')
        .eq('soc', soc).eq('area_type', 'national').maybeSingle(),
    ]);
    if (!occ) return null;
    const { occ: o } = toWages({ ...occ, ...(wage ?? {}) });
    known.set(o.soc, o);
    return o;
  } catch {
    return null;
  }
}
