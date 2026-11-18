/**
 * Is there a way to train for a job near the user? (2026-10-26, Amit)
 *
 * A promotion (other than the manager job) is only suggested when there is a
 * real program for it near the user:
 *   - an approved training program (DOL training-program list) within
 *     SEARCH_RADIUS_MI of the user's ZIP or metro, or in their state when only
 *     the state is known; or
 *   - for a job that usually needs a degree (associate or higher), a college
 *     program near the user (College Scorecard list, same as DegreePrograms).
 * Fully-online programs don't count as "near".
 *
 * 'unknown' = we couldn't check (no location yet, or the lookup failed) —
 * the job is then not ruled out.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { SEARCH_RADIUS_MI } from './home';
import { fetchDegreeOptions } from './careerData';

export type PathNear = 'yes' | 'no' | 'unknown';

/** First education level that is a degree (O*NET RL scale: 5 = associate) — same as careerMoves.DEGREE_LIST_FROM */
const DEGREE_FROM = 5;

type Point = { lat: number; lon: number } | null | undefined;

const cache = new Map<string, Promise<PathNear>>();

async function check(soc: string, eduLevel: number | null, state: string | null, point: Point): Promise<PathNear> {
  if (!state && !point) return 'unknown';
  let failed = false;
  const { data, error } = await supabase.rpc('training_options', {
    p_soc: soc, p_state: state, p_limit: 1,
    ...(point ? { p_lat: point.lat, p_lon: point.lon, p_radius: SEARCH_RADIUS_MI } : {}),
  });
  if (error || !data) failed = true;
  else if (Number(data.summary?.in_state) > 0) return 'yes';
  if (eduLevel != null && eduLevel >= DEGREE_FROM) {
    const maxLevel = eduLevel >= 8 ? eduLevel + 1 : eduLevel;
    const deg = await fetchDegreeOptions(soc, eduLevel, maxLevel, state, point ?? null);
    if (!deg) failed = true;
    else if (deg.summary.nearby > 0) return 'yes';
  }
  return failed ? 'unknown' : 'no';
}

export function pathNear(soc: string, eduLevel: number | null, state: string | null, point: Point): Promise<PathNear> {
  const key = [soc, eduLevel ?? '', state ?? '', point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : ''].join('|');
  if (!cache.has(key)) {
    const p = check(soc, eduLevel, state, point).catch(() => 'unknown' as const);
    p.then((r) => { if (r === 'unknown') cache.delete(key); });   // try again next time
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** Path status per job (missing = still checking) */
export function usePathsNear(jobs: Array<{ soc: string; eduLevel: number | null }>, state: string | null, point: Point) {
  const key = jobs.map((j) => `${j.soc}:${j.eduLevel ?? ''}`).join(',') + `|${state ?? ''}|${point?.lat ?? ''},${point?.lon ?? ''}`;
  const [paths, setPaths] = useState<Record<string, PathNear>>({});
  useEffect(() => {
    let alive = true;
    setPaths({});
    jobs.forEach((j) => {
      pathNear(j.soc, j.eduLevel, state, point).then((r) => {
        if (alive) setPaths((cur) => ({ ...cur, [j.soc]: r }));
      });
    });
    return () => { alive = false; };
  }, [key]);
  return useMemo(() => paths, [paths]);
}
