/**
 * Benchmarks data layer
 *
 * Reads official wage and union-premium figures from Supabase (kept current by
 * the `refresh-benchmarks` Edge Function) and falls back to the numbers bundled
 * in the app when offline or before the first refresh has run.
 *
 * Every result says where it came from (`level`, `period`, `sourceLabel`) so
 * screens can show the source and date next to the number.
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { shortJobName } from './format';
import { OCCUPATIONS, ALL_OCCUPATIONS_BENCHMARK } from '../data/blsOews';
import { t, tSource } from '../i18n';
import { SRC, estimate } from '../data/sourceLabels';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WageDistribution {
  p10: number; p25: number; p50: number; p75: number; p90: number;
}

export interface WageBenchmark extends WageDistribution {
  soc: string;
  /** state = state-specific BLS data; national = US-wide; bundled = offline fallback */
  level: 'state' | 'national' | 'bundled';
  areaLabel: string;
  period: string;          // OEWS reference year, e.g. '2024'
  sourceLabel: string;     // e.g. "BLS OEWS, May 2024 · Pennsylvania"
}

export interface UnionPremium {
  group: string;
  label: string;           // BLS occupation group label
  unionWeekly: number;
  nonunionWeekly: number;
  premiumPct: number;      // e.g. 30.6 → union members earn 30.6% more (median)
  period: string;          // data year
  live: boolean;
  sourceLabel: string;     // e.g. "BLS Union Members, 2025 data"
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12',
  GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23',
  MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33',
  NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44',
  SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55',
  WY: '56',
};

const ALL_OCCUPATIONS_SOC = '00-0000';
const BUNDLED_OEWS_PERIOD = '2023';

function bundledWages(soc: string): WageBenchmark {
  const occ = OCCUPATIONS.find((o) => o.soc === soc);
  const w = occ ?? ALL_OCCUPATIONS_BENCHMARK;
  return {
    soc: occ ? soc : ALL_OCCUPATIONS_SOC,
    p10: w.p10, p25: w.p25, p50: w.p50, p75: w.p75, p90: w.p90,
    level: 'bundled',
    areaLabel: 'United States',
    period: BUNDLED_OEWS_PERIOD,
    sourceLabel: `${SRC.BLS}, ${BUNDLED_OEWS_PERIOD} (built-in) · US`,
  };
}

// Same figures as the migration seed (BLS Union Members 2025, Table 4)
const BUNDLED_UNION: Array<{ group: string; label: string; soc: string[]; u: number; n: number }> = [
  { group: 'total', label: 'All workers', soc: ['00'], u: 1404, n: 1174 },
  { group: 'service', label: 'Service occupations', soc: ['31', '33', '35', '37', '39'], u: 1158, n: 762 },
  { group: 'healthcare_support', label: 'Healthcare support', soc: ['31'], u: 884, n: 777 },
  { group: 'protective', label: 'Protective service', soc: ['33'], u: 1728, n: 1011 },
  { group: 'food_prep', label: 'Food preparation and serving', soc: ['35'], u: 757, n: 699 },
  { group: 'building_cleaning', label: 'Building and grounds cleaning', soc: ['37'], u: 924, n: 744 },
  { group: 'personal_care', label: 'Personal care and service', soc: ['39'], u: 907, n: 750 },
  { group: 'sales', label: 'Sales and related', soc: ['41'], u: 1043, n: 1116 },
  { group: 'office', label: 'Office and administrative support', soc: ['43'], u: 1145, n: 963 },
  { group: 'construction', label: 'Construction and extraction', soc: ['47'], u: 1561, n: 1004 },
  { group: 'installation', label: 'Installation, maintenance, and repair', soc: ['49'], u: 1571, n: 1140 },
  { group: 'production', label: 'Production', soc: ['51'], u: 1161, n: 945 },
  { group: 'transportation', label: 'Transportation and material moving', soc: ['53'], u: 1174, n: 866 },
];
const BUNDLED_UNION_PERIOD = '2025';

/** Shorter, friendlier labels than the BLS table titles */
function tidyGroupLabel(label: string) {
  return label
    .replace(/\s*occupations?$/i, '')
    .replace(/, 16 years and over/i, '')
    .replace(/^total$/i, 'All workers')
    .replace(/ related$/i, '');
}

// ── Fetchers (cached per session) ────────────────────────────────────────────

const wageCache = new Map<string, Promise<WageBenchmark>>();

/**
 * Wage distribution for an occupation, as specific as the data allows:
 * state (if a state is given and BLS publishes that cell) → national → bundled.
 */
export function getWageBenchmark(soc: string | null | undefined, stateAbbr?: string | null): Promise<WageBenchmark> {
  const code = soc || ALL_OCCUPATIONS_SOC;
  const fips = stateAbbr ? STATE_FIPS[stateAbbr] : undefined;
  const key = `${code}|${fips ?? 'US'}`;
  if (!wageCache.has(key)) {
    wageCache.set(key, fetchWage(code, fips).catch(() => bundledWages(code)));
  }
  return wageCache.get(key)!;
}

async function fetchWage(soc: string, fips?: string): Promise<WageBenchmark> {
  const areaCodes = fips ? ['US', fips] : ['US'];
  const { data, error } = await supabase
    .from('latest_wage_benchmarks')
    .select('soc, area_type, area_code, area_label, p10, p25, p50, p75, p90, period')
    .eq('soc', soc)
    .in('area_code', areaCodes)
    .not('p50', 'is', null);
  if (error || !data?.length) return bundledWages(soc);

  const pick = (fips && data.find((r) => r.area_type === 'state' && r.area_code === fips))
    || data.find((r) => r.area_type === 'national');
  if (!pick) return bundledWages(soc);

  const b = bundledWages(soc);
  const num = (v: unknown, fallback: number) => (typeof v === 'number' || typeof v === 'string') && Number(v) > 0 ? Number(v) : fallback;
  // Fill any suppressed percentile from the national/bundled shape, scaled to this median
  const scale = num(pick.p50, b.p50) / b.p50;
  const level = pick.area_type === 'state' ? 'state' : 'national';
  const areaLabel = pick.area_label ?? (level === 'state' ? 'your state' : 'United States');
  return {
    soc,
    p10: num(pick.p10, b.p10 * scale),
    p25: num(pick.p25, b.p25 * scale),
    p50: num(pick.p50, b.p50),
    p75: num(pick.p75, b.p75 * scale),
    p90: num(pick.p90, b.p90 * scale),
    level,
    areaLabel,
    period: String(pick.period),
    sourceLabel: `${SRC.BLS}, ${pick.period} · ${level === 'state' ? areaLabel : 'US'}`,
  };
}

let unionCache: Promise<UnionPremium[]> | null = null;

function loadUnionPremiums(): Promise<UnionPremium[]> {
  if (!unionCache) {
    unionCache = (async () => {
      const { data, error } = await supabase
        .from('latest_union_premiums')
        .select('occupation_group, occupation_label, soc_majors, union_weekly, nonunion_weekly, premium_pct, period');
      if (error || !data?.length) throw new Error('no data');
      return data.map((r: any) => ({
        group: r.occupation_group,
        label: tidyGroupLabel(r.occupation_label),
        unionWeekly: Number(r.union_weekly),
        nonunionWeekly: Number(r.nonunion_weekly),
        premiumPct: Number(r.premium_pct),
        period: String(r.period),
        live: true,
        sourceLabel: `${SRC.BLS}, ${r.period} data`,
        _soc: r.soc_majors as string[],
      })) as Array<UnionPremium & { _soc: string[] }>;
    })().catch(() =>
      BUNDLED_UNION.map((b) => ({
        group: b.group,
        label: b.label,
        unionWeekly: b.u,
        nonunionWeekly: b.n,
        premiumPct: Math.round((b.u / b.n - 1) * 1000) / 10,
        period: BUNDLED_UNION_PERIOD,
        live: false,
        sourceLabel: `${SRC.BLS}, ${BUNDLED_UNION_PERIOD} data (built-in)`,
        _soc: b.soc,
      })),
    );
  }
  return unionCache;
}

/**
 * Union premium for the occupation group that contains this SOC code.
 * Most specific group wins (e.g. food prep over all service); falls back to
 * all workers when the SOC is unknown.
 */
export async function getUnionPremium(soc: string | null | undefined): Promise<UnionPremium> {
  const all = (await loadUnionPremiums()) as Array<UnionPremium & { _soc: string[] }>;
  const major = soc ? soc.slice(0, 2) : null;
  const candidates = major ? all.filter((g) => g._soc.includes(major)) : [];
  candidates.sort((a, b) => a._soc.length - b._soc.length);
  const hit = candidates[0] ?? all.find((g) => g.group === 'total') ?? all[0];
  const { _soc, ...rest } = hit;
  return rest;
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useWageBenchmark(soc: string | null | undefined, stateAbbr?: string | null) {
  const [value, setValue] = useState<WageBenchmark>(() => bundledWages(soc || ALL_OCCUPATIONS_SOC));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getWageBenchmark(soc, stateAbbr).then((v) => {
      if (alive) { setValue(v); setLoading(false); }
    });
    return () => { alive = false; };
  }, [soc, stateAbbr]);
  return { benchmark: value, loading };
}

export function useUnionPremium(soc: string | null | undefined) {
  const [value, setValue] = useState<UnionPremium | null>(null);
  useEffect(() => {
    let alive = true;
    getUnionPremium(soc).then((v) => { if (alive) setValue(v); });
    return () => { alive = false; };
  }, [soc]);
  return value;
}

// ── Opportunity gains computed from benchmarks ──────────────────────────────

/**
 * Personal union uplift: what the user's pay would be at the union/non-union
 * median ratio for their occupation group. Rounded to $100. 0 if no premium.
 */
export function unionUplift(annualEarnings: number, premium: UnionPremium | null): number {
  if (!premium || premium.premiumPct <= 0 || annualEarnings <= 0) return 0;
  return Math.round((annualEarnings * premium.premiumPct) / 100 / 100) * 100;
}

/** Display values for an opportunity, with model-based gains filled in. */
export function personalizeGain(
  opp: { gain: string; gainAmount: number; gainModel?: 'union_premium' | 'min_wage_gap' | 'relocation' | 'cert_gap'; source?: string },
  annualEarnings: number,
  premium: UnionPremium | null,
  ctx: {
    minWageShortfall?: number; minWage?: number; baseHourly?: number;
    /** Best place for this job after cost of living (see lib/relocation) */
    relocation?: { gain: number; place: string; realPct: number; vsYouPct?: number | null } | null;
    /** Certified vs uncertified pay in the user's job (see lib/certPay); null = still loading */
    certGap?: { gain: number; title: string; yearlyLow: number | null; yearlyHigh: number | null; reliable: boolean; period: string } | null | 'none';
  } = {},
): { gainAmount: number; gain: string; source?: string } {
  if (opp.gainModel === 'cert_gap') {
    const c = ctx.certGap;
    if (c === undefined || c === null) return { gainAmount: 0, gain: t(opp.gain) };
    if (c === 'none') return { gainAmount: 0, gain: t('No official survey data on certified workers in your job yet') };
    const who = shortJobName(c.title);
    const source = tSource(estimate([SRC.CENSUS], c.period));
    if (!c.reliable || c.gain <= 0 || c.yearlyLow == null || c.yearlyHigh == null) {
      return { gainAmount: 0, gain: t('No clear pay difference between {who} with and without a certification or license', { who }), source };
    }
    return {
      gainAmount: c.gain,
      gain: t('Full-time {who} with a certification or license typically earn {low}–{high} more a year than those without (median pay)', { who, low: `$${c.yearlyLow.toLocaleString()}`, high: `$${c.yearlyHigh.toLocaleString()}` }),
      source,
    };
  }
  if (opp.gainModel === 'relocation') {
    const r = ctx.relocation;
    if (!r) return { gainAmount: 0, gain: t('See where your job pays more — after cost of living') };
    if (r.gain <= 0) return { gainAmount: 0, gain: t('Your area already pays well for this job, after cost of living') };
    return {
      gainAmount: r.gain,
      gain: r.vsYouPct != null
        ? t('Typical pay for your job in {place} is worth {pct}% more than you earn now, after living costs', { place: r.place, pct: r.vsYouPct })
        : t('In {place} your job pays about {pct}% more — even after higher or lower living costs', { place: r.place, pct: r.realPct }),
      source: tSource(estimate([SRC.BLS, SRC.BEA])),
    };
  }
  if (opp.gainModel === 'min_wage_gap') {
    const short = ctx.minWageShortfall ?? 0;
    if (short > 0) {
      return {
        gainAmount: short,
        gain: t('Your pay looks below what the law requires — about {amount}/yr short', { amount: `$${short.toLocaleString()}` }),
        source: tSource('US Dept. of Labor state minimum wage table'),
      };
    }
    return {
      gainAmount: 0,
      gain: ctx.baseHourly && ctx.minWage
        ? t('{pay}/hr vs {min} minimum — check your hours and overtime', { pay: `$${ctx.baseHourly.toFixed(2)}`, min: `$${ctx.minWage.toFixed(2)}` })
        : t(opp.gain),
    };
  }
  if (opp.gainModel !== 'union_premium') return { gainAmount: opp.gainAmount, gain: t(opp.gain), source: opp.source ? tSource(t(opp.source)) : undefined };
  if (!premium) return { gainAmount: 0, gain: t('Calculating union pay difference…') };
  const who = UNION_GROUP_PEOPLE[premium.group] ? t(UNION_GROUP_PEOPLE[premium.group]) : undefined;
  const pct = Math.round(premium.premiumPct);
  if (premium.premiumPct <= 0) {
    return {
      gainAmount: 0,
      gain: who
        ? t("Union {who} don't earn more than non-union ones (median pay) — the gains are job protections and benefits", { who })
        : t('No clear union pay premium — the gains are job protections and benefits'),
      source: tSource(premium.sourceLabel),
    };
  }
  return {
    gainAmount: unionUplift(annualEarnings, premium),
    gain: who
      ? t('Union {who} earn {pct}% more than non-union {who} (median weekly pay)', { who, pct })
      : t('Across US workers overall, union members earn {pct}% more than non-union (median weekly pay)', { pct }),
    source: tSource(premium.sourceLabel),
  };
}

/**
 * Short line under the union item's title in lists (Opportunity.teaser,
 * Amit 2026-11-07): "Union construction workers earn 25% more". Nothing when
 * there's no data yet or no pay premium. Same figure as personalizeGain.
 */
export function unionTeaser(premium: UnionPremium | null): string | undefined {
  if (!premium || premium.premiumPct <= 0) return undefined;
  const pct = Math.round(premium.premiumPct);
  if (pct <= 0) return undefined;
  const who = UNION_GROUP_PEOPLE[premium.group] ? t(UNION_GROUP_PEOPLE[premium.group]) : undefined;
  return who ? t('Union {who} earn {pct}% more', { who, pct }) : t('Union members earn {pct}% more (all US workers)', { pct });
}

/** Plain-English "who" for each BLS occupation group (total = no specific group) */
const UNION_GROUP_PEOPLE: Record<string, string> = {
  service: 'service workers',
  healthcare_support: 'healthcare support workers',
  protective: 'security & protective service workers',
  food_prep: 'food-service workers',
  building_cleaning: 'cleaning & maintenance workers',
  personal_care: 'personal care workers',
  sales: 'sales workers',
  office: 'office & admin workers',
  construction: 'construction workers',
  installation: 'installation & repair workers',
  production: 'production workers',
  transportation: 'transportation & warehouse workers',
};
