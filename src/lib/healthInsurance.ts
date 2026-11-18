/**
 * "Ask your employer for health insurance" — an action item, not just a figure
 * (Amit, 2026-11-06; plan doc "fixmyjob – Employer Health Insurance Data Plan (ACS)").
 *
 *  - How common it is: share of employees in the user's job (and state, and pay
 *    band from their STATED pay) with health insurance through a job — our
 *    estimate from the Census Bureau's American Community Survey (table
 *    acs_health_insurance, RPC health_insurance_share; scripts/import-acs-insurance.mjs).
 *    It counts insurance from the person's own job OR a family member's — the
 *    app says so, and never words it as "X in 10 employers offer it".
 *  - What it's worth: what employers in the user's state pay toward it a year
 *    (AHRQ MEPS-IC, table meps_ic_premiums; scripts/import-meps-premiums.mjs).
 *
 * Never asked in onboarding. The user says what they have inside the action or
 * in Profile (store healthCoverage):
 *   no / not answered / not sure → suggested when ≥ SUGGEST_FROM of similar workers have it
 *   yes, pays more than the state's average employee share → "ask them to pay more of it"
 *   yes, pays the average or less (or didn't say what) → covered: no longer suggested
 * Its yearly value counts in the potential yearly boost (Amit, 2026-11-06):
 * the state's average employer share (none), or what the user pays above the
 * state's average employee share (pays more). Until the user answers it is 0,
 * like a rights item still to check — most workers in these jobs already have it.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import { useUserStore, type HealthCoverage } from '../store/userStore';
import { useMinimumWageCheck } from './useMinimumWageCheck';
import { t, useLang } from '../i18n';
import { money, shortJobName } from './format';
import { SRC, estimate } from '../data/sourceLabels';
import type { Opportunity } from '../data/opportunityCatalog';

export const HEALTH_ID = 'health-insurance';
/** Suggest the action when at least this share of similar workers has it (starting value — tune with real data) */
export const SUGGEST_FROM = 0.6;
/** Margin of error above which "about 7 in 10" becomes softer words ("most") */
const WIDE_MOE = 0.07;

export type CoverageType = NonNullable<HealthCoverage['covers']>;
export type HealthStatus = 'unknown' | 'none' | 'pays_more' | 'covered';

export interface HealthShare {
  level: 'state_occ_band' | 'state_occ' | 'us_occ' | 'state_group';
  state: string;
  occ: string;
  pct: number;
  moe: number;
  n: number;
  period: string;          // '2020-2024'
}

export interface PremiumRow {
  year: number;
  state: string;           // 'OH' or 'US'
  coverage: CoverageType;
  premium: number | null;
  employee: number | null;
  employer: number | null;
  employee_p50: number | null;
  employer_reliable: boolean;
}

// ── Data ────────────────────────────────────────────────────────────────────

const shareCache = new Map<string, HealthShare | null>();
/** undefined = couldn't ask (offline, migration not pushed) — not cached */
export async function fetchHealthShare(soc: string, state: string | null, hourly: number | null): Promise<HealthShare | null | undefined> {
  const h = hourly && hourly > 0 ? Math.round(hourly * 100) / 100 : null;
  const key = `${soc}|${state ?? ''}|${h ?? ''}`;
  if (shareCache.has(key)) return shareCache.get(key)!;
  const { data, error } = await supabase.rpc('health_insurance_share', { p_soc: soc, p_state: state, p_hourly: h });
  if (error) return undefined;
  const r = (data ?? [])[0];
  const out: HealthShare | null = r ? {
    level: r.level, state: r.state, occ: r.occ,
    pct: Number(r.pct), moe: Number(r.moe), n: Number(r.n), period: r.acs_period,
  } : null;
  shareCache.set(key, out);
  return out;
}

const premiumCache = new Map<string, PremiumRow[]>();
/** The latest year's rows for the state and the US */
export async function fetchPremiums(state: string | null): Promise<PremiumRow[] | undefined> {
  const key = state ?? 'US';
  if (premiumCache.has(key)) return premiumCache.get(key)!;
  const { data, error } = await supabase
    .from('meps_ic_premiums')
    .select('year,state,coverage,premium,employee,employer,employee_p50,employer_reliable')
    .in('state', state ? [state, 'US'] : ['US'])
    .order('year', { ascending: false });
  if (error) return undefined;
  const rows = (data ?? []) as PremiumRow[];
  const latest = rows[0]?.year;
  const out = rows.filter((r) => r.year === latest).map((r) => ({
    ...r,
    premium: r.premium == null ? null : Number(r.premium),
    employee: r.employee == null ? null : Number(r.employee),
    employer: r.employer == null ? null : Number(r.employer),
    employee_p50: r.employee_p50 == null ? null : Number(r.employee_p50),
  }));
  premiumCache.set(key, out);
  return out;
}

/** The state's row for a coverage type; the US row when the state has none or AHRQ flags its employer figure */
export function premiumFor(rows: PremiumRow[] | null | undefined, state: string | null, coverage: CoverageType): PremiumRow | null {
  if (!rows?.length) return null;
  const own = state ? rows.find((r) => r.state === state && r.coverage === coverage) : undefined;
  if (own && own.employer_reliable && own.employer != null && own.employee != null) return own;
  return rows.find((r) => r.state === 'US' && r.coverage === coverage) ?? null;
}

// ── The user's situation ────────────────────────────────────────────────────

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Where the user stands, and what the action is worth a year */
export function healthStatus(c: HealthCoverage | null, rows: PremiumRow[] | null | undefined, state: string | null) {
  const covers: CoverageType = c?.has === 'yes' && c.covers ? c.covers : 'single';
  const p = premiumFor(rows, state, covers);
  if (!c || c.has === 'unsure') return { status: 'unknown' as HealthStatus, value: 0, premium: premiumFor(rows, state, 'single') };
  if (c.has === 'no') return { status: 'none' as HealthStatus, value: p?.employer ? round10(p.employer) : 0, premium: p };
  const yearly = c.monthly != null && c.monthly >= 0 ? c.monthly * 12 : null;
  if (yearly != null && p?.employee != null && yearly > p.employee) {
    return { status: 'pays_more' as HealthStatus, value: round10(yearly - p.employee), premium: p, yearly };
  }
  return { status: 'covered' as HealthStatus, value: 0, premium: p, yearly };
}

/** "workers in healthcare jobs" for the state × major group figure */
const GROUP_WORDS: Record<string, string> = {
  '11': 'management jobs', '13': 'business and finance jobs', '15': 'computer and math jobs',
  '17': 'engineering jobs', '19': 'science jobs', '21': 'community and social service jobs',
  '23': 'legal jobs', '25': 'teaching and library jobs', '27': 'arts, media and sports jobs',
  '29': 'healthcare jobs', '31': 'healthcare support jobs', '33': 'protective service jobs',
  '35': 'food service jobs', '37': 'cleaning and grounds jobs', '39': 'personal care jobs',
  '41': 'sales jobs', '43': 'office jobs', '45': 'farming, fishing and forestry jobs',
  '47': 'construction jobs', '49': 'repair and maintenance jobs', '51': 'production jobs',
  '53': 'transportation and moving jobs',
};

/** "about 8 in 10" / "most" — softer words when the margin of error is wide */
function shareWords(s: HealthShare): string {
  const tenths = Math.round(s.pct * 10);
  if (s.moe > WIDE_MOE) {
    if (s.pct >= 0.75) return t('most');
    if (s.pct >= 0.5) return t('more than half of');
  }
  if (tenths >= 10) return t('almost all');
  return t('about {x} in 10', { x: tenths });
}

/** Same, short, for the line under the title in lists: "About 8 in 10 registered nurses in Ohio get health insurance" */
export function shareTeaser(s: HealthShare, job: string | null, stateName: string | null): string {
  const tenths = Math.round(s.pct * 10);
  const share = s.moe > WIDE_MOE && s.pct >= 0.75 ? t('Most')
    : s.moe > WIDE_MOE && s.pct >= 0.5 ? t('More than half of')
    : tenths >= 10 ? t('Almost all')
    : t('About {x} in 10', { x: tenths });
  const place = stateName ?? t('your state');
  const who = job ?? t('people in your job');
  if (s.level === 'state_occ_band') return t('{share} {who} in {place} paid like you get health insurance', { share, who, place });
  if (s.level === 'state_occ') return t('{share} {who} in {place} get health insurance', { share, who, place });
  if (s.level === 'us_occ') return t('{share} {who} in the US get health insurance', { share, who });
  const group = GROUP_WORDS[s.occ] ? t(GROUP_WORDS[s.occ]) : t('jobs like yours');
  return t('{share} workers in {group} in {place} get health insurance', { share, group, place });
}

/** "In Ohio, about 8 in 10 registered nurses get health insurance through a job." */
export function shareSentence(s: HealthShare, job: string | null, stateName: string | null): string {
  const share = shareWords(s);
  const place = stateName ?? t('your state');
  const who = job ?? t('people in your job');
  if (s.level === 'state_occ_band') return t('In {place}, {share} {who} paid like you get health insurance through a job.', { place, share, who });
  if (s.level === 'state_occ') return t('In {place}, {share} {who} get health insurance through a job.', { place, share, who });
  if (s.level === 'us_occ') return t('Across the US, {share} {who} get health insurance through a job.', { share, who });
  const group = GROUP_WORDS[s.occ] ? t(GROUP_WORDS[s.occ]) : t('jobs like yours');
  return t('In {place}, {share} workers in {group} get health insurance through a job.', { place, share, group });
}

const STEPS: Opportunity['steps'] = [
  { title: 'Check your pay stub and job offer', detail: 'Look for a health insurance line. Some jobs offer it only after a waiting period — by law, no longer than 90 days.' },
  { title: 'Ask HR or your manager', detail: 'Ask: “Do you offer health insurance, and when can I join?” Ask in writing and keep a copy.' },
  { title: 'Ask for it in your next pay talk', detail: 'If they don’t offer it, or you pay a lot for it, ask for it — or for higher pay to make up for it.' },
  { title: 'Look at HealthCare.gov', detail: 'If your job won’t help, you may get help paying for your own plan there.', url: 'https://www.healthcare.gov/' },
];

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * The health insurance action for the current user. Always returns the item
 * (so it stays visible in the plan and opens from Profile); `suggested` says
 * whether to offer it now.
 */
export function useHealthInsurance() {
  const { matchedOccupation, locationState, locationStateName, healthCoverage } = useUserStore();
  const mw = useMinimumWageCheck();
  const lang = useLang();
  const soc = matchedOccupation?.soc ?? null;
  // Wage band from the user's STATED pay (Amit, 2026-11-06), per hour
  const hourly = mw.baseHourly > 0 ? mw.baseHourly : null;
  const [share, setShare] = useState<HealthShare | null | undefined>(undefined);
  const [premiums, setPremiums] = useState<PremiumRow[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    if (!soc) { setShare(null); return; }
    fetchHealthShare(soc, locationState, hourly).then((s) => { if (alive) setShare(s ?? null); });
    return () => { alive = false; };
  }, [soc, locationState, hourly]);

  useEffect(() => {
    let alive = true;
    fetchPremiums(locationState).then((r) => { if (alive) setPremiums(r ?? null); });
    return () => { alive = false; };
  }, [locationState]);

  return useMemo(() => {
    const st = healthStatus(healthCoverage, premiums, locationState);
    const job = matchedOccupation?.title ? shortJobName(matchedOccupation.title) : null;
    const usPremium = st.premium?.state === 'US';
    const place = !usPremium && locationStateName ? locationStateName : t('the US');
    const why = share ? shareSentence(share, job, locationStateName) : '';
    const employer = st.premium?.employer ?? null;
    const worth =
      st.status === 'pays_more' && st.premium?.employee != null && st.yearly != null
        ? t('You pay about {you} a year. Workers in {place} pay about {avg} on average for the same cover.', { you: money(st.yearly), place, avg: money(st.premium.employee) })
      : st.status === 'covered'
        ? t('You already have it through your job.')
      : employer != null
        ? (st.status === 'none'
          ? t('Employers in {place} pay about {amount} a year toward one worker’s health insurance.', { place, amount: money(employer) })
          : t('Where a job offers it, employers in {place} pay about {amount} a year toward one worker’s health insurance.', { place, amount: money(employer) }))
      : '';
    const gain = [why, worth].filter(Boolean).join(' ') || t('Most jobs like yours come with health insurance. Check what you get.');

    const from: string[] = [];
    if (share) from.push(SRC.CENSUS);
    if (employer != null) from.push(SRC.AHRQ);
    const years = [share?.period.replace('-', '–'), st.premium?.year].filter(Boolean).join('; ');
    const source = from.length ? estimate(from, years || null) : undefined;

    const item: Opportunity = {
      id: HEALTH_ID,
      title: st.status === 'pays_more' ? 'Ask your employer to pay more of your health insurance' : 'Ask your employer for health insurance',
      gain,
      gainAmount: st.value,
      teaser: share && st.status !== 'covered' ? shareTeaser(share, job, locationStateName) : undefined,
      note: share ? 'This counts health insurance through a person’s own job or a family member’s job.' : '',
      jobFamily: 'All',
      goalAlignment: ['earn_more'],
      steps: STEPS,
      timeline: 'A few weeks',
      physicalDemand: 'low',
      kind: 'add_on',
      source,
      effort: 'quick',
      effortHours: 3,
    };
    const common = !!share && share.pct >= SUGGEST_FROM;
    return {
      /** Still loading the figures */
      loading: share === undefined || premiums === undefined,
      share: share ?? null,
      premium: st.premium,
      status: st.status,
      value: st.value,
      /** "In Ohio, about 8 in 10 nurses get …" (empty without data) */
      why,
      item,
      /** Offer it now: common in the user's job, and they're not already covered well */
      suggested: common && st.status !== 'covered',
      coverage: healthCoverage,
    };
  }, [share, premiums, healthCoverage, locationState, locationStateName, matchedOccupation?.title, lang]);
}
