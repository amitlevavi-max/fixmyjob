/**
 * Recommendations test harness (quality testing — not part of the app).
 *
 * getRecommendations(input) fills the app's own store the way onboarding and
 * Profile do, runs the app's own hooks (usePlanView / useOpportunities) against
 * the live Supabase data, waits until every lookup has finished, and returns
 * the same task list My plan shows: Quick wins / Worth the effort / Big moves.
 *
 * Nothing here re-implements the recommendation logic, so results can't drift
 * from the app. Nothing is saved (no sign-in → the store's saves are no-ops).
 *
 * Built and run by run.mjs (esbuild bundles this file with the app's src/).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useUserStore, type Goal, type PlanDecision } from '../../src/store/userStore';
import { usePlanView, EFFORT_INFO } from '../../src/lib/planView';
import { useOpportunities } from '../../src/lib/useOpportunities';
import { confidentOccupation, searchOccupations, fetchOccupationBySoc } from '../../src/lib/occupationSearch';
import { STATES } from '../../src/data/locationData';
import { locateZip } from '../../src/lib/home';
import { defaultSchedule, type WorkSchedule } from '../../src/lib/wageCheck';
import type { RightsFacts } from '../../src/lib/rightsFacts';
import { useLangStore } from '../../src/i18n';
import type { OccupationWages } from '../../src/data/blsOews';
import type { Opportunity } from '../../src/data/opportunityCatalog';
import { useWageBenchmark } from '../../src/lib/benchmarks';
import { calcPercentile } from '../../src/data/blsOews';
import { getAspirationResult } from '../../src/data/aspirationEngine';
import { getWageMultiplier, getWithinStateMultiplier } from '../../src/data/locationData';
import { placeInSentence } from '../../src/lib/format';

// ── Input ────────────────────────────────────────────────────────────────────

export interface RecommendationInput {
  // Mandatory — what onboarding asks
  /** Main goal (onboarding step 1) */
  goal: Goal;
  /** Job as the user would type it, e.g. "forklift driver". Not needed when `soc` is given. */
  job?: string;
  /** Time in this job, in months (or use yearsInJob) */
  monthsInJob?: number;
  yearsInJob?: number;
  /** Yearly pay, $ (onboarding pay question) */
  annualPay: number;

  // Optional — asked later in the app (Profile, Where I stand, Claim my rights…)
  /** Exact occupation (BLS SOC, e.g. "53-7051"), as if picked from the list. "none" = "my job isn't listed". */
  soc?: string;
  /** When the job text isn't a clear match, take the best candidate instead of stopping (bulk testing) */
  autoPickOccupation?: boolean;
  /** Other goals (Profile → other goals) */
  otherGoals?: Goal[];
  /** Where the user works. { state: "CA", metro: "Los Angeles" } · { state: "CA", rural: true } · { state: "CA" } = city, no metro picked */
  location?: { state: string; metro?: string; rural?: boolean };
  /** Home ZIP code (the app asks for it when finding training) — training and courses are then searched around it */
  zip?: string;
  employer?: string;
  /** Base hourly rate, $ */
  hourlyRate?: number;
  /** Work schedule for the pay check; missing fields = state defaults */
  workSchedule?: Partial<WorkSchedule>;
  /** "Do you have this?" answers for mandatory credentials: { "<credential name>": true | false } */
  credentials?: Record<string, boolean>;
  /** Claim my rights answers (see src/lib/rightsFacts.ts RightsFacts) */
  rightsAnswers?: RightsFacts;
  /** Items already added to the plan / ruled out: { "<item id>": "in_plan" | "not_pursuing" } */
  planDecisions?: Record<string, PlanDecision>;
  /** 'en' (default) or 'es' */
  language?: 'en' | 'es';
  /** Include each item's explanation and steps */
  details?: boolean;
}

const GOALS: Goal[] = ['earn_more', 'rise_up', 'work_life_balance', 'change_careers', 'claim_rights', 'less_physical'];

export class InputError extends Error {
  constructor(message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

function validate(i: RecommendationInput): string[] {
  const errs: string[] = [];
  if (!i || typeof i !== 'object') return ['Input must be a JSON object'];
  if (!i.goal) errs.push('goal is required');
  else if (!GOALS.includes(i.goal)) errs.push(`goal must be one of: ${GOALS.join(', ')}`);
  for (const g of i.otherGoals ?? []) if (!GOALS.includes(g)) errs.push(`otherGoals: unknown goal "${g}"`);
  if (!i.job?.trim() && !i.soc) errs.push('job is required (or give soc)');
  if (i.soc === 'none' && !i.job?.trim()) errs.push('soc "none" needs job (how the user describes it)');
  if (i.monthsInJob == null && i.yearsInJob == null) errs.push('monthsInJob (or yearsInJob) is required');
  for (const k of ['monthsInJob', 'yearsInJob', 'annualPay', 'hourlyRate'] as const) {
    if (i[k] != null && !(Number.isFinite(Number(i[k])) && Number(i[k]) >= 0)) errs.push(`${k} must be a number ≥ 0`);
  }
  if (i.annualPay == null) errs.push('annualPay is required');
  if (i.language && !['en', 'es'].includes(i.language)) errs.push('language must be "en" or "es"');
  return errs;
}

/** Same result the app's LocationPicker gives */
function resolveLocation(loc: NonNullable<RecommendationInput['location']>) {
  const q = String(loc.state ?? '').trim().toLowerCase();
  const st = STATES.find((s) => s.abbr.toLowerCase() === q || s.name.toLowerCase() === q);
  if (!st) throw new InputError(`Unknown state "${loc.state}"`);
  if (loc.rural) return { stateAbbr: st.abbr, stateName: st.name, isMetro: false, label: `Rural / suburban ${st.name}` };
  if (loc.metro) {
    const m = loc.metro.trim().toLowerCase();
    const metro = st.metros.find((x) => x.name.toLowerCase() === m)
      ?? st.metros.find((x) => x.name.toLowerCase().includes(m));
    if (!metro) throw new InputError(`"${loc.metro}" is not one of the ${st.name} metro areas in the app`, { metros: st.metros.map((x) => x.name) });
    return { stateAbbr: st.abbr, stateName: st.name, isMetro: true, metroName: metro.name, label: `${metro.name}, ${st.abbr}` };
  }
  return { stateAbbr: st.abbr, stateName: st.name, isMetro: true, label: `City in ${st.name}` };
}

/** The occupation, as onboarding would settle it */
async function resolveOccupation(i: RecommendationInput): Promise<{ occ: OccupationWages | null; how: string }> {
  if (i.soc === 'none') return { occ: null, how: 'not listed (soc "none")' };
  if (i.soc) {
    const occ = await fetchOccupationBySoc(i.soc);
    if (!occ) throw new InputError(`Unknown occupation code "${i.soc}"`);
    return { occ, how: 'given soc' };
  }
  const text = i.job!.trim();
  const sure = await confidentOccupation(text);
  if (sure) return { occ: sure, how: 'clear match (the app would not ask)' };
  const res = await searchOccupations(text, 6);
  const candidates = res.hits.map((h) => ({ soc: h.occ.soc, title: h.occ.title, score: Math.round(h.score * 100) / 100, ...(h.suggested && { aiSuggested: true }) }));
  if (i.autoPickOccupation && res.hits[0]) return { occ: res.hits[0].occ, how: 'not a clear match — took the top candidate (autoPickOccupation)' };
  throw new InputError(
    `"${text}" isn't a clear match — the app would ask the user to pick. Add "soc" (one of the candidates, or "none"), or set "autoPickOccupation": true.`,
    { candidates },
  );
}

// ── Running the app's hooks ──────────────────────────────────────────────────

let inflight = 0;
let fetchWrapped = false;
function trackFetch() {
  if (fetchWrapped) return;
  fetchWrapped = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    inflight++;
    try { return await orig(...args); } finally { inflight--; }
  }) as typeof fetch;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Snapshot = { view: ReturnType<typeof usePlanView>; opps: ReturnType<typeof useOpportunities>; standing: ReturnType<typeof useStanding> };

/**
 * "Your earnings rank" on Where I stand — the same steps as src/screens/Standing.tsx (section 1).
 * Kept in step with that screen by hand: if the screen's maths changes, change this too.
 */
function useStanding() {
  const { profile, matchedOccupation, locationState, locationIsMetro, locationMetro, locationLabel } = useUserStore();
  const { benchmark: wages, loading } = useWageBenchmark(matchedOccupation?.soc, locationState);
  const earnings = profile.annualEarnings ?? 0;
  const m = !locationState
    ? 1
    : wages.level === 'state'
    ? getWithinStateMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
    : getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined);
  const localWages = { p10: wages.p10 * m, p25: wages.p25 * m, p50: wages.p50 * m, p75: wages.p75 * m, p90: wages.p90 * m };
  const percentile = calcPercentile(earnings, localWages);
  const aspiration = getAspirationResult({ annualEarnings: earnings, matchedOccupation, locationState, locationIsMetro, locationMetro, localWages });
  const source = wages.sourceLabel +
    (locationState && wages.level !== 'state' ? ' · adjusted for your area' : '') +
    (locationState && wages.level === 'state' && locationIsMetro !== null ? ' · area-adjusted' : '');
  return { loading, percentile, aspiration, localWages, source, place: placeInSentence(locationLabel) };
}

function Probe({ out }: { out: { current: Snapshot | null } }) {
  const view = usePlanView();
  const opps = useOpportunities();
  const standing = useStanding();
  out.current = { view, opps, standing };
  return null;
}

/** Fingerprint of what the result would contain, to know when loading has finished */
function fingerprint(s: Snapshot | null) {
  if (!s) return '';
  return (s.standing.loading ? 'wages-loading' : s.standing.percentile) + JSON.stringify(s.view.buckets.map((b) => [b.effort, b.items.map((o) => [o.id, s.view.display(o).gainAmount])]));
}

// One request at a time: the app's store is a single global
let queue: Promise<unknown> = Promise.resolve();
export function getRecommendations(input: RecommendationInput, opts: { timeoutMs?: number } = {}) {
  const run = queue.then(() => doGet(input, opts.timeoutMs ?? 45000));
  queue = run.catch(() => {});
  return run;
}

async function doGet(input: RecommendationInput, timeoutMs: number) {
  const errs = validate(input);
  if (errs.length) throw new InputError(errs.join('; '));
  trackFetch();
  const started = Date.now();

  // Fresh user, in the order the app collects things
  const s = useUserStore.getState();
  s.reset();
  useLangStore.setState({ lang: input.language ?? 'en', ready: true });
  const location = input.location ? resolveLocation(input.location) : null;
  if (location) s.setLocation(location);          // before the job: credentials depend on the state
  if (input.zip) {
    // The lookup can be slow or time out on a cold database — try 3 times, and tell a lookup failure from an unknown ZIP
    let home: Awaited<ReturnType<typeof locateZip>> = null;
    let failure: unknown = null;
    for (let attempt = 0; attempt < 3 && !home; attempt++) {
      try { home = await locateZip(String(input.zip)); failure = null; if (!home) break; } catch (e) { failure = e; }
    }
    if (!home) throw new InputError(failure ? `Couldn't look up ZIP "${input.zip}": ${String((failure as Error)?.message ?? failure)}` : `Unknown ZIP code "${input.zip}"`);
    useUserStore.getState().setHome(home);
  }
  s.setFocusGoal(input.goal);
  if (input.otherGoals?.length) useUserStore.getState().setOtherGoals(input.otherGoals);

  const { occ, how } = await resolveOccupation(input);
  const role = (input.soc === 'none' ? input.job!.trim() : input.job?.trim()) || occ?.title || '';
  useUserStore.getState().setProfile({ role });
  useUserStore.getState().setMatchedOccupation(occ);

  const months = input.monthsInJob != null ? Math.round(Number(input.monthsInJob)) : Math.round(Number(input.yearsInJob) * 12);
  useUserStore.getState().setProfile({
    tenureMonths: months < 60 ? months : null,
    yearsExperience: Math.floor(months / 12),
    annualEarnings: Number(input.annualPay),
    employer: input.employer?.trim() || undefined,
    ...(input.hourlyRate != null && { hourlyRate: Number(input.hourlyRate) }),
  });
  if (input.workSchedule) useUserStore.getState().setWorkSchedule({ ...defaultSchedule(location?.stateAbbr), ...input.workSchedule });
  if (input.credentials) useUserStore.setState({ credentials: { ...input.credentials } });
  if (input.rightsAnswers) useUserStore.setState({ rightsFacts: { ...input.rightsAnswers } });
  if (input.planDecisions) useUserStore.setState({ planDecisions: { ...input.planDecisions } });

  // Render the app's hooks and wait until every lookup has landed and the list stops changing
  const out: { current: Snapshot | null } = { current: null };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => { renderer = TestRenderer.create(<Probe out={out} />); });
  let last = '';
  let stable = 0;
  let timedOut = false;
  while (stable < 3) {
    await act(async () => { await sleep(250); });
    const fp = fingerprint(out.current);
    stable = inflight === 0 && fp === last ? stable + 1 : 0;
    last = fp;
    if (Date.now() - started > timeoutMs) { timedOut = true; break; }
  }
  const { view, opps, standing: sd } = out.current!;
  await act(async () => { renderer.unmount(); });

  const st = useUserStore.getState();
  const item = (o: (typeof view.buckets)[number]['items'][number]) => {
    const g = view.display(o);
    return {
      id: o.id,
      title: view.titleOf(o),
      gainAmount: g.gainAmount,
      gain: g.gain,
      source: g.source ?? o.source ?? null,
      kind: o.kind ?? 'career_move',
      moveType: o.exclusiveGroup === 'promotion' ? (o.isManager ? 'move_up (manager)' : 'move_up') : o.exclusiveGroup === 'career_change' ? 'career_change' : null,
      ...(o.exclusiveGroup === 'promotion' && !o.isManager && { trainingNearby: o.pathNear ?? 'unknown' }),
      /** The user's goals this item helps (decides its place in the bucket) */
      forYourGoals: view.goalsOf(o),
      /** Every goal the item helps */
      goals: o.goalAlignment,
      status: view.isInPlan(o) ? 'in_plan' : 'to_review',
      ...(input.details && { note: o.note, steps: o.steps.map((x) => ({ title: x.title, detail: x.detail, ...(x.url && { url: x.url }) })) }),
      ...(o.course && { course: courseSummary(o.course) }),
    };
  };
  const listed = [...view.active, ...view.pending];
  const boost = opps.boostOf(listed);

  return {
    profile: {
      goals: st.goals.map((g) => g.id),
      occupation: st.matchedOccupation ? { soc: st.matchedOccupation.soc, title: st.matchedOccupation.title } : null,
      occupationMatch: how,
      role: st.profile.role,
      monthsInJob: months,
      annualPay: st.profile.annualEarnings,
      location: st.locationLabel,
      zip: st.homePoint?.zip ?? null,
      employer: st.profile.employer ?? null,
      language: input.language ?? 'en',
    },
    buckets: view.buckets.map((b) => ({
      effort: b.effort,
      title: EFFORT_INFO[b.effort].title,
      sub: EFFORT_INFO[b.effort].sub,
      items: b.items.map(item),
    })),
    potentialBoost: { total: boost.total, parts: boost.parts },
    counts: { suggested: view.suggested.length, inPlan: view.accepted.length, toReview: view.pending.length, notForMe: view.rejected.length, done: view.done.length },
    minimumWageShortfall: view.shortfall,
    /** Where I stand → "Your earnings rank" (the first thing the app shows) */
    standing: {
      percentile: sd.percentile,
      scenario: sd.aspiration.scenario,
      place: sd.place,
      localPay: {
        p10: Math.round(sd.localWages.p10), p25: Math.round(sd.localWages.p25), median: Math.round(sd.localWages.p50),
        p75: Math.round(sd.localWages.p75), p90: Math.round(sd.localWages.p90),
      },
      gapToMedian: sd.aspiration.gapToMedian,
      source: sd.source,
    },
    meta: { ms: Date.now() - started, ...(timedOut && { warning: `Stopped waiting after ${timeoutMs} ms — some data may still have been loading` }) },
  };
}

/** Everything the course screen shows, flat (DOL list or web search) */
function courseSummary(c: NonNullable<Opportunity['course']>) {
  const w = c.web;
  if (w) {
    return {
      from: 'web search', foundAt: w.foundAt, provider: w.provider, name: w.name, format: w.format, location: w.location,
      length: w.duration ?? (w.hours ? `about ${Math.round(w.hours)} hours` : null), price: w.price, priceSource: w.price_source,
      credential: w.credential, url: w.url, phone: w.phone, email: w.email, sources: w.sources,
      results: null,
    };
  }
  const finished = c.exited != null && c.completion_rate != null ? Math.round(c.exited * c.completion_rate) : null;
  return {
    from: 'DOL approved training programs', provider: c.provider, name: c.name, format: c.format,
    location: c.address ?? [c.city, c.state].filter(Boolean).join(', '), distanceMi: c.distance_mi,
    length: `about ${Math.round(c.total_hours)} hours over ${Math.max(1, Math.round(c.weeks ?? 1))} week(s)`,
    price: c.tuition != null ? `$${Math.round(c.tuition + (c.supplies ?? 0)).toLocaleString('en-US')}` : null,
    credential: c.credential, url: c.url,
    phone: null, email: null,   // looked up live on the course screen (Edge Function course-contact)
    results: {
      finished, completionRate: c.completion_rate ?? null, employed6mo: c.employed_q2_rate ?? null,
      yearlyPayAfter: c.median_q2_earnings ? c.median_q2_earnings * 4 : null, credentialRate: c.credential_rate ?? null,
      reported: c.reported_at ?? null,
    },
  };
}

export type RecommendationResult = Awaited<ReturnType<typeof doGet>>;
