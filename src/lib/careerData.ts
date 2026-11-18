/**
 * Official career-path data for the user's occupation (Supabase functions from
 * migration 20261019000000_career_paths.sql):
 *
 *  - occupation_credentials_for(soc, state) — mandatory licenses, certifications
 *    and training (federal rules; state licenses later from CareerOneStop)
 *  - career_links(soc, state) — promotions ('advancement') and career changes
 *    from O*NET related occupations + BLS OEWS pay, each with the target's
 *    own mandatory credentials and the skills it needs more of (O*NET)
 *
 * Results are cached per occupation + state for the session. Errors (offline,
 * migration not pushed yet) return null and are not cached, so a later visit
 * tries again.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { STATE_FIPS } from './benchmarks';

export interface Credential {
  name: string;
  kind: 'license' | 'certification' | 'endorsement' | 'training';
  /** false = needed only for some of the jobs (see condition) */
  mandatory: boolean;
  condition: string | null;
  authority: string | null;
  source_url: string;
  /** state FIPS when the credential is state-specific, else null */
  state: string | null;
}

export interface CareerLink {
  soc: string;
  title: string;
  kind: 'advancement' | 'career_change' | 'lower_pay';
  basis: string[];
  pay_ratio: number;
  median_national: number;
  median_state: number | null;
  /** Pay used for the move's value: state median, else estimated from national pay */
  median_local: number;
  median_local_basis: 'state' | 'estimated' | 'national';
  job_zone_from: number | null;
  job_zone_to: number | null;
  /** Most common required education (O*NET RL level 1–12) of the current and the target job */
  edu_from: number | null;
  edu_to: number | null;
  /** % of the target job's O*NET respondents naming that level */
  edu_to_share: number | null;
  skill_gaps: Array<{ skill: string; gap: number }> | null;
  credentials: Credential[];
  wage_period: string | null;
  onet_version: string | null;
}

const fipsOf = (state: string | null | undefined) => (state ? STATE_FIPS[state] ?? null : null);

const credCache = new Map<string, Credential[]>();
const linkCache = new Map<string, CareerLink[]>();

export async function fetchCredentials(soc: string, state: string | null | undefined): Promise<Credential[] | null> {
  const key = `${soc}|${state ?? ''}`;
  if (credCache.has(key)) return credCache.get(key)!;
  const { data, error } = await supabase.rpc('occupation_credentials_for', { p_soc: soc, p_state: fipsOf(state) });
  if (error) return null;
  const list = (Array.isArray(data) ? data : []) as Credential[];
  credCache.set(key, list);
  return list;
}

export async function fetchCareerLinks(soc: string, state: string | null | undefined): Promise<CareerLink[] | null> {
  const key = `${soc}|${state ?? ''}`;
  if (linkCache.has(key)) return linkCache.get(key)!;
  const { data, error } = await supabase.rpc('career_links', { p_soc: soc, p_state: fipsOf(state) });
  if (error) return null;
  const list = ((Array.isArray(data) ? data : []) as any[]).map((l) => ({
    ...l,
    pay_ratio: Number(l.pay_ratio),
    median_national: Number(l.median_national),
    median_state: l.median_state == null ? null : Number(l.median_state),
    median_local: Number(l.median_local ?? l.median_state ?? l.median_national),
    median_local_basis: l.median_local_basis ?? (l.median_state != null ? 'state' : 'national'),
    credentials: Array.isArray(l.credentials) ? l.credentials : [],
  })) as CareerLink[];
  linkCache.set(key, list);
  return list;
}

function useCached<T>(fetcher: (soc: string, state: string | null | undefined) => Promise<T | null>,
  soc: string | null | undefined, state: string | null | undefined) {
  const [s, setS] = useState<{ loading: boolean; data: T | null }>({ loading: !!soc, data: null });
  useEffect(() => {
    let alive = true;
    if (!soc) { setS({ loading: false, data: null }); return; }
    setS((p) => ({ loading: true, data: p.data }));
    fetcher(soc, state).then((data) => { if (alive) setS({ loading: false, data }); });
    return () => { alive = false; };
  }, [soc, state]);
  return s;
}

/** Mandatory credentials of an occupation (data = null while loading or on error) */
export const useCredentials = (soc: string | null | undefined, state: string | null | undefined) =>
  useCached(fetchCredentials, soc, state);

/** Promotions and career changes from an occupation */
export const useCareerLinks = (soc: string | null | undefined, state: string | null | undefined) =>
  useCached(fetchCareerLinks, soc, state);

/** Only credentials that are required for everyone in the job */
export const mandatoryOnly = (list: Credential[] | null | undefined) => (list ?? []).filter((c) => c.mandatory);

// ── College programs that lead to an occupation (degree_options) ────────────

export interface DegreeProgram {
  id: string;
  school: string;
  cip: string;
  cip_title: string | null;
  award_level: 'associate' | 'bachelor' | 'post_bacc_cert' | 'master' | 'post_master_cert' | 'doctor_professional' | 'doctor_research' | 'doctor_other';
  graduates: number | null;
  state: string | null;
  city: string | null;
  url: string | null;
  online: 'full' | 'partial' | null;
  earnings_field: string | null;
  earn_1yr: number | null;
  earn_5yr: number | null;
  earn_n: number | null;
  tuition_in: number | null;
  tuition_out: number | null;
  /** Yearly tuition + fees the user would pay: in-state when the school is in their state */
  tuition: number | null;
  tuition_basis: 'in_state' | 'out_of_state' | null;
  data_year: string | null;
  distance_mi: number | null;
}

export interface DegreeOptions {
  summary: {
    /** Programs in the list: fully online or within radius_mi */
    total: number; nearby: number; online: number; nationwide: number;
    radius_mi: number | null;
    /** 'point' = ZIP or metro, 'state' = middle of the state, 'none' = online only */
    centre: 'point' | 'state' | 'none';
    median_earn_1yr: number | null; data_year: string | null;
  };
  /** Cheapest tuition first */
  programs: DegreeProgram[];
}

/** Search radius: 100 miles around a ZIP / metro point, 200 around the middle of the state */
export const DEGREE_RADIUS_POINT = 100;
export const DEGREE_RADIUS_STATE = 200;

export const DEGREE_SOURCE = 'US Dept. of Education';

/**
 * Programs at O*NET education level minLevel..maxLevel for one occupation that
 * are fully online or near the user (one list, cheapest tuition first; null on error)
 */
export async function fetchDegreeOptions(soc: string, minLevel: number, maxLevel: number,
  state: string | null, point?: { lat: number; lon: number } | null): Promise<DegreeOptions | null> {
  const { data, error } = await supabase.rpc('degree_options', {
    p_soc: soc, p_min_level: minLevel, p_max_level: maxLevel, p_state: state,
    p_lat: point?.lat ?? null, p_lon: point?.lon ?? null,
    p_radius_mi: point ? DEGREE_RADIUS_POINT : DEGREE_RADIUS_STATE, p_limit: 200,
  });
  if (error || !data) return null;
  return data as DegreeOptions;
}
