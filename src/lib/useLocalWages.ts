/**
 * Wages for an occupation where the user lives: BLS state data when published
 * (plus the metro/rural adjustment), otherwise national data scaled by the
 * state's wage index. Same method as the "where you stand" chart.
 */

import { useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { useWageBenchmark, WageBenchmark } from './benchmarks';
import { getWageMultiplier, getWithinStateMultiplier } from '../data/locationData';
import { searchOccupations } from './occupationSearch';
import { OccupationWages } from '../data/blsOews';
import { t, tSource, useLang } from '../i18n';

export interface LocalWages {
  p10: number; p25: number; p50: number; p75: number; p90: number;
  benchmark: WageBenchmark;
  /** e.g. "BLS OEWS, May 2025 · New Jersey · area-adjusted" */
  sourceLine: string;
  /** "New Jersey", or "the US" when no state is set */
  areaName: string;
  loading: boolean;
}

export function useLocalWages(soc: string | null | undefined): LocalWages {
  const { locationState, locationStateName, locationIsMetro, locationMetro } = useUserStore();
  const { benchmark, loading } = useWageBenchmark(soc, locationState);
  const lang = useLang();
  return useMemo(() => {
    const m = !locationState
      ? 1
      : benchmark.level === 'state'
      ? getWithinStateMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
      : getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined);
    const sourceLine =
      tSource(benchmark.sourceLabel) +
      (locationState && benchmark.level !== 'state' ? ` · ${t('adjusted for your area')}` : '') +
      (locationState && benchmark.level === 'state' && locationIsMetro !== null ? ` · ${t('area-adjusted')}` : '');
    return {
      p10: benchmark.p10 * m, p25: benchmark.p25 * m, p50: benchmark.p50 * m,
      p75: benchmark.p75 * m, p90: benchmark.p90 * m,
      benchmark,
      sourceLine,
      areaName: locationStateName ?? (locationState ? locationState : t('the US')),
      loading,
    };
  }, [benchmark, loading, locationState, locationStateName, locationIsMetro, locationMetro, lang]);
}

/** The BLS occupation that best matches a job title (e.g. an AI-suggested next role). */
export function useOccupationForTitle(title: string | null | undefined) {
  const [occ, setOcc] = useState<OccupationWages | null>(null);
  const [loading, setLoading] = useState(!!title);
  useEffect(() => {
    let alive = true;
    if (!title) { setOcc(null); setLoading(false); return; }
    setLoading(true);
    searchOccupations(title, 3).then((res) => {
      if (!alive) return;
      const best = res.hits[0];
      // Database scores are 0–1; local keyword scores need a real hit
      const ok = best && (res.source === 'db' ? best.score >= 0.45 : best.score >= 5);
      setOcc(ok ? best.occ : null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [title]);
  return { occupation: occ, loading };
}
