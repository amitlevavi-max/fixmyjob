/**
 * One source of truth for the user's opportunities and their combined
 * "potential boost", so the summary, the opportunity cards and the share
 * screen always show consistent numbers.
 *
 * Combining rule (see Opportunity.kind):
 *   pay fixes + add-ons stack  →  summed (add-ons sharing a countGroup count once)
 *   career moves are alternatives  →  only the best one counts
 *   one-off back pay  →  not yearly income, excluded
 *
 * Promotions, career changes and the user's missing mandatory credentials
 * come from official data (data/careerMoves): see pickPromotions there for
 * which promotions are suggested; up to MOVES_SUGGESTED career changes. Once
 * the user keeps one of a kind in the plan, only that one is.
 *
 * Every goal's suggestions are worked out for every user (2026-10-26); the
 * user's goals only change the order and Where I stand.
 *
 * Health insurance through a job (lib/healthInsurance, 2026-11-06): suggested
 * when most similar workers have it and the user isn't covered as well as
 * most; its yearly value is an add-on in the boost.
 */

import { useMemo, useEffect } from 'react';
import { useUserStore, goalsByImportance, type Goal } from '../store/userStore';
import { getOpportunitiesForGoal, jobFamilyFor, opportunityCatalog, Opportunity } from '../data/opportunityCatalog';
import { useUnionPremium, personalizeGain, unionTeaser } from './benchmarks';
import { useMinimumWageCheck } from './useMinimumWageCheck';
import { useRelocationGain } from './relocation';
import { useRiseOpportunities } from '../data/riseOpportunities';
import { useCareerItems, MOVES_SUGGESTED, pickPromotions } from '../data/careerMoves';
import { useCertGapContext } from './certPay';
import { localizeOpportunity } from './localizeOpportunity';
import { useRightsCheck } from './rightsCheck';
import { useLang, t } from '../i18n';
import { useUserUnion, isUnionMember } from './unionMembership';
import { usePathsNear } from './promotionPaths';
import { useSearchPoint } from './home';
import { useShortCourses, courseItem, useWebCourses, webCourseItem, courseSearchItem, COURSE_SEARCH_ID, type WebCourseRequest } from './shortCourses';
import { courseArea } from './home';
import { useHealthInsurance } from './healthInsurance';

/** The union item with the union's name in the title and the pay difference as its teaser — one object per union, teaser and language (lists compare by identity) */
const unionItems = new Map<string, Opportunity>();
function unionItem(o: Opportunity, short: string, withThe: boolean, teaser: string | undefined): Opportunity {
  const key = `${o.title}|${short}|${teaser ?? ''}`;
  if (!unionItems.has(key)) unionItems.set(key, { ...o, title: t(withThe ? 'Join the {union}' : 'Join {union}', { union: short }), teaser });
  return unionItems.get(key)!;
}

/** Goals in plain words for the course web search */
const GOAL_WORDS: Record<Goal, string> = {
  earn_more: 'Earn more money', rise_up: 'Get promoted', work_life_balance: 'Better work-life balance',
  change_careers: 'Change careers', claim_rights: 'Get paid fairly / claim my rights at work', less_physical: 'Less physical work',
};

/** Every goal, in the order the app lists them */
export const ALL_GOALS: Goal[] = ['earn_more', 'rise_up', 'work_life_balance', 'change_careers', 'claim_rights', 'less_physical'];

export interface BoostPart {
  label: string;
  amount: number;
  note?: string;
}

export function useOpportunities() {
  const { goals, focusGoal, profile, matchedOccupation, planDecisions, locationState, locationStateName, homePoint, locationIsMetro, locationMetro, credentials, courseMaxMiles } = useUserStore();
  useLang();   // re-run when the language changes
  const unionPremium = useUnionPremium(matchedOccupation?.soc);
  const mw = useMinimumWageCheck();
  const reloc = useRelocationGain();
  const earnings = profile.annualEarnings ?? 0;   // required at onboarding
  const certGap = useCertGapContext(matchedOccupation?.soc, earnings);

  const display = (o: Opportunity) =>
    personalizeGain(o, earnings, unionPremium, {
      minWageShortfall: mw.annualShortfall,
      minWage: mw.minimum.rate,
      baseHourly: mw.baseHourly,
      relocation: reloc.top
        ? { gain: reloc.gain, place: reloc.top.place.short, realPct: reloc.top.realPct, vsYouPct: reloc.top.vsYouPct }
        : reloc.ready ? { gain: 0, place: '', realPct: 0 } : null,
      certGap,
    });

  // Earlier AI "next role" items: no longer suggested, kept for plans that have them
  const rise = useRiseOpportunities();
  const career = useCareerItems();
  const family = jobFamilyFor(matchedOccupation?.soc, profile.role);
  /** Career changes: the one in the plan, else the best few (promotions: pickPromotions) */
  const movesToSuggest = (list: Opportunity[]) => {
    const chosen = list.find((o) => planDecisions[o.id] === 'in_plan');
    return chosen ? [chosen] : list.filter((o) => planDecisions[o.id] !== 'not_pursuing').slice(0, MOVES_SUGGESTED);
  };
  // Claim my rights: one item per right that is owed or still to check (lib/rightsCheck)
  const rights = useRightsCheck();
  // A short course as a Quick win (lib/shortCourses): in the user's own job or
  // toward the jobs of their promotions and career changes; the best one is suggested
  const moveTargets = useMemo(() => {
    const m: Record<string, { title: string; move: 'promotion' | 'career_change' }> = {};
    for (const o of career.promotions) if (o.targetSoc) m[o.targetSoc] = { title: o.targetTitle ?? '', move: 'promotion' };
    for (const o of career.changes) if (o.targetSoc && !m[o.targetSoc]) m[o.targetSoc] = { title: o.targetTitle ?? '', move: 'career_change' };
    return m;
  }, [career.promotions, career.changes]);
  const courseSocs = useMemo(() => [...(matchedOccupation?.soc ? [matchedOccupation.soc] : []), ...Object.keys(moveTargets)],
    [matchedOccupation?.soc, moveTargets]);
  const point = useSearchPoint({ homePoint, locationIsMetro, locationMetro, locationState });
  const promoSocs = useMemo(() => Object.entries(moveTargets).filter(([, m]) => m.move === 'promotion').map(([soc]) => soc), [moveTargets]);
  const courses = useShortCourses(courseSocs, matchedOccupation?.soc ?? null, locationState, point, promoSocs, courseMaxMiles);
  // Nothing valid on the DOL list → an AI web search with the same rules (lib/shortCourses, suggest-course)
  const webRequest = useMemo<WebCourseRequest | null>(() => {
    const job = matchedOccupation?.title ?? profile.role;
    if (!job) return null;
    const months = profile.tenureMonths ?? (profile.yearsExperience != null ? profile.yearsExperience * 12 : null);
    return {
      job, soc: matchedOccupation?.soc ?? null,
      goals: (goals.length ? goalsByImportance(goals).map((g) => g.id) : [focusGoal ?? 'earn_more']).map((g) => GOAL_WORDS[g]),
      pay: profile.annualEarnings ?? null, monthsInJob: months,
      credentialsHeld: Object.entries(credentials).filter(([, has]) => has).map(([n]) => n),
      location: {
        city: homePoint?.city ?? (locationIsMetro && locationMetro ? locationMetro.split('/')[0].trim() : null),
        state: locationState, stateName: locationStateName, zip: homePoint?.zip ?? null,
      },
      nextJobs: Object.entries(moveTargets).map(([soc, m]) => ({ soc, title: m.title, kind: m.move === 'promotion' ? 'promotion' : 'career change' })),
      maxMiles: courseMaxMiles,
    };
  }, [matchedOccupation?.title, matchedOccupation?.soc, profile.role, profile.tenureMonths, profile.yearsExperience, profile.annualEarnings,
      goals, focusGoal, credentials, homePoint, locationIsMetro, locationMetro, locationState, locationStateName, moveTargets, courseMaxMiles]);
  // Only once the next jobs have loaded and the DOL list for all of them is empty — not on the
  // first, own-job-only check while they load (that started a paid search the DOL list then made useless)
  const web = useWebCourses(webRequest, !career.movesLoading && Array.isArray(courses) && courses.length === 0);
  // Neither found a course → a stand-in item that asks for the ZIP code and driving distance (Amit, 2026-10-27)
  const courseNone = !!webRequest && Array.isArray(courses) && courses.length === 0 && !!web && web.courses.length === 0;
  const coursePlace = courseArea({ homePoint, locationIsMetro, locationMetro, locationState, locationStateName })?.label ?? null;
  const courseItems = useMemo(() => (courses?.length
    ? courses.map((c) => courseItem(c, matchedOccupation?.soc ?? null, moveTargets, { state: locationState, stateName: locationStateName }))
    : courseNone ? [courseSearchItem(courseMaxMiles, coursePlace)]
    : (web?.courses ?? []).map((w) => webCourseItem(w, web!.searchedAt, { state: locationState, stateName: locationStateName }))),
    [courses, web, courseNone, courseMaxMiles, coursePlace, moveTargets, matchedOccupation?.soc, locationState, locationStateName]);
  // The stand-in was added to the plan (or skipped) and a course has now been found: the choice moves to that course
  const foundCourseId = courseItems.find((o) => !o.courseSearch)?.id;
  useEffect(() => {
    const d = planDecisions[COURSE_SEARCH_ID];
    if (!foundCourseId || !d) return;
    const { setPlanDecision } = useUserStore.getState();
    if (!planDecisions[foundCourseId]) setPlanDecision(foundCourseId, d);
    setPlanDecision(COURSE_SEARCH_ID, null);
  }, [foundCourseId, planDecisions[COURSE_SEARCH_ID]]);
  // Ask your employer for health insurance (lib/healthInsurance)
  const health = useHealthInsurance();
  const dataItems = [
    ...rights.suggested,
    ...(health.suggested ? [health.item] : []),
    ...courseItems.slice(0, 1),
    ...career.credentialItems, ...pickPromotions(career.promotions, planDecisions), ...movesToSuggest(career.changes),
  ];
  /** The older pay-check items: replaced by the rights items (minimum wage now checked for everyone) */
  const OLD_CLAIM_IDS = ['minimum-wage-check', 'wage-theft-claim'];
  // ── Only concrete suggestions (Amit, 2026-10-26) ──
  // A general item is suggested only when we can name something specific:
  //   union          → a union for the user's job (data/unionDirectory); the title names it
  //   certificate    → an approved training program for the user's job near them (lib/promotionPaths)
  //   relocation     → a specific place where the job pays more after living costs
  // Only a union specific to the user's occupation, and not for someone already in a union (2026-11-13)
  const union = useUserUnion();
  const unionMember = isUnionMember(useUserStore((st) => st.unionMembership));
  const ownSoc = matchedOccupation?.soc ?? null;
  const ownPath = usePathsNear(ownSoc ? [{ soc: ownSoc, eduLevel: null }] : [], locationState, point);
  const concrete = (o: Opportunity) => {
    if (o.id === 'union-membership') return !!union && !unionMember;
    if (o.id === 'get-certified') return !!ownSoc && ownPath[ownSoc] === 'yes';
    if (o.gainModel === 'relocation') return !!reloc.top && reloc.gain > 0;
    return true;
  };
  // The generic "certificate in your job" also not when the job has mandatory credentials
  // (the missing-credential items carry the same Census gap)
  const hideGeneric = (o: Opportunity) =>
    (o.id === 'get-certified' && (career.ownCredentials?.length ?? 0) > 0)
    || OLD_CLAIM_IDS.includes(o.id)
    || !concrete(o);
  /** The union item names the union we found ("Join the Teamsters") */
  const named = (o: Opportunity) => (o.id === 'union-membership' && union ? unionItem(o, union.short, !!union.withThe, unionTeaser(unionPremium)) : o);
  /** What we suggest for one goal */
  const forGoal = (g: Goal) => [
    ...dataItems.filter((o) => o.goalAlignment.includes(g)),
    ...getOpportunitiesForGoal(g, family, (o) => display(o).gainAmount, hideGeneric),
  ].map(localizeOpportunity).map(named);
  // Every goal the user has (focus first); before onboarding ends, "Earn more money"
  const userGoals: Goal[] = goals.length ? goalsByImportance(goals).map((g) => g.id) : [focusGoal ?? 'earn_more'];
  const byGoal = userGoals.map((g) => ({ goal: g, opportunities: forGoal(g) }));
  // Every goal is worked out, whatever the user picked (decision Amit 2026-10-26):
  // the user's goals first (focus goal first), then the others. Their goals
  // only decide the order (lib/planView) and what Where I stand shows.
  const allByGoal = [
    ...byGoal,
    ...ALL_GOALS.filter((g) => !userGoals.includes(g)).map((g) => ({ goal: g, opportunities: forGoal(g) })),
  ];
  const seen = new Set<string>();
  const opportunities = allByGoal.flatMap((x) => x.opportunities).filter((o) => !seen.has(o.id) && !!seen.add(o.id));
  const all = [...rights.items, health.item, ...career.all, ...courseItems, ...rise, ...opportunityCatalog].map(localizeOpportunity).map(named);

  // ── Combined yearly boost ────────────────────────────────────────────────
  const boostOf = (list: Opportunity[]) => {
  const parts: BoostPart[] = [];
  let bestMove: { opp: Opportunity; amount: number } | null = null;
  let movesCount = 0;
  const groupPart = new Map<string, BoostPart>();
  for (const o of list) {
    const amount = display(o).gainAmount;
    if (amount <= 0) continue;
    const kind = o.kind ?? 'career_move';
    if (kind === 'pay_fix') parts.push({ label: t('Get paid what the law requires'), amount });
    else if (kind === 'add_on' && o.countGroup) {
      // Items sharing a gain (e.g. several missing credentials) count once
      const cur = groupPart.get(o.countGroup);
      if (!cur) { const p = { label: o.title, amount }; groupPart.set(o.countGroup, p); parts.push(p); }
      else if (amount > cur.amount) { cur.amount = amount; cur.label = o.title; }
    }
    else if (kind === 'add_on') parts.push({ label: o.title, amount });
    else if (kind === 'career_move') {
      movesCount++;
      if (!bestMove || amount > bestMove.amount) bestMove = { opp: o, amount };
    }
  }
  if (bestMove) {
    parts.push({
      label: t('Best career move: {title}', { title: bestMove.opp.title }),
      amount: bestMove.amount,
      note: movesCount > 1 ? t('other career moves are alternatives, so only the best counts') : undefined,
    });
  }
  const total = parts.reduce((s, p) => s + p.amount, 0);
  return { total, parts };
  };

  // The user's plan (opportunities they added) and the ones they ruled out
  const planned = all.filter((o) => planDecisions[o.id] === 'in_plan');
  const notPursuing = all.filter((o) => planDecisions[o.id] === 'not_pursuing');

  return {
    /** Every suggestion (all goals), each once — the user's goals' first */
    opportunities,
    /** Suggestions per goal of the user's, most important goal first */
    byGoal,
    /** Suggestions per goal for ALL goals: the user's first, then the rest */
    allByGoal,
    userGoals,
    display, all, boostOf,
    /** Official career-path data (mandatory credentials, all promotions / career changes) */
    career,
    boost: boostOf(opportunities),
    plan: { opportunities: planned, notPursuing, boost: boostOf(planned) },
  };
}
