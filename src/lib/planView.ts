/**
 * One view of the user's suggestions and plan, shared by Where I stand and
 * My plan so both always show the same lists and numbers.
 *
 *   suggested — what we suggest now, for EVERY goal (2026-10-26: the user's
 *               goals only set the order). Pay-claim items only when the pay
 *               check finds a problem.
 *   accepted  — in the plan (may include items no longer suggested)
 *   pending   — suggested, not decided yet ("To review")
 *   rejected  — "Not for me"
 *   done      — accepted with every step checked
 *   buckets   — ONE task list (in the plan, not done + still to review),
 *               grouped by effort (2026-10-21, Amit): Quick wins → Worth the
 *               effort → Big moves. Inside a bucket: the focus goal's items
 *               first, then the user's other goals, then the rest (2026-10-26);
 *               then highest yearly value, less effort, A–Z. Each item shows which of
 *               the user's goals it helps (goalsOf); totals count it once.
 */
import { useMemo } from 'react';
import { useLang } from '../i18n';
import { useUserStore, type Goal } from '../store/userStore';
import { useOpportunities } from './useOpportunities';
import { useMinimumWageCheck } from './useMinimumWageCheck';
import {
  certificationsFirst, titleForGoal, effortOf, effortHoursOf, EFFORT_ORDER,
  type Effort, type Opportunity,
} from '../data/opportunityCatalog';
import { cosFlagRank } from './cosFlags';

/** Pay below the legal minimum: always first in the user's list */
const MIN_WAGE_ID = 'right:minimum_wage';

export interface EffortBucket {
  effort: Effort;
  /** In the plan (not done) and still to review, sorted by value */
  items: Opportunity[];
}

/** Bucket headings (English keys for t()) */
export const EFFORT_INFO: Record<Effort, { title: string; sub: string; icon: string }> = {
  quick: { title: 'Quick wins', sub: 'A few hours of your time', icon: 'f:zap' },
  effort: { title: 'Worth the effort', sub: 'Weeks or months of training', icon: 'f:trending-up' },
  big: { title: 'Big moves', sub: 'A degree or a move to a new city', icon: 'f:flag' },
};

export function usePlanView() {
  const { planDecisions, planMeta, locationState } = useUserStore();
  const { allByGoal, userGoals, display, all, boostOf } = useOpportunities();
  const mw = useMinimumWageCheck();
  const shortfall = locationState ? mw.annualShortfall : 0;
  const lang = useLang();

  return useMemo(() => {
    /** One goal's suggestions: best gain first, certifications before relocation, a legal pay problem on top */
    const rank = (opps: Opportunity[]) => {
      // Certifications CareerOneStop flags come first, even before items worth more (Amit, 2026-11-18)
      const byGain = certificationsFirst([...opps].sort((a, b) => cosFlagRank(a) - cosFlagRank(b) || display(b).gainAmount - display(a).gainAmount));
      const claim = shortfall > 0 ? opps.find((o) => o.id === MIN_WAGE_ID) : undefined;
      return claim ? [claim, ...byGain.filter((o) => o !== claim)] : byGain;
    };
    // Every goal's suggestions (2026-10-26) — the user's goals only set the order
    const rankedByGoal = allByGoal.map((x) => ({ goal: x.goal, list: rank(x.opportunities) }));
    const seen = new Set<string>();
    const suggested: Opportunity[] = rankedByGoal.flatMap((x) => x.list).filter((o) => !seen.has(o.id) && !!seen.add(o.id));
    const suggestedIds = new Set(suggested.map((o) => o.id));

    const accepted = all.filter((o) => planDecisions[o.id] === 'in_plan');
    const rejected = all.filter((o) => planDecisions[o.id] === 'not_pursuing');
    const pending = suggested.filter((o) => !planDecisions[o.id]);
    const isDone = (o: Opportunity) => {
      const doneSteps = planMeta[o.id]?.stepsDone ?? [];
      return o.steps.length > 0 && o.steps.every((_, i) => doneSteps.includes(i));
    };
    const active = accepted.filter((o) => !isDone(o));
    const done = accepted.filter(isDone);
    // Everything ever suggested or decided, for "All suggestions"
    const everything = [...suggested, ...all.filter((o) => planDecisions[o.id] && !suggestedIds.has(o.id))];

    /** The user's goals this item helps with, most important first */
    const goalsOf = (o: Opportunity): Goal[] => userGoals.filter((g) => o.goalAlignment.includes(g));
    const titleOf = (o: Opportunity, goal?: Goal | null) => titleForGoal(o, goal ?? goalsOf(o));

    // The one task list, grouped by effort (2026-10-26, Amit): inside a bucket,
    // items for the focus goal first, then the user's other goals, then the
    // rest; a legal pay problem on top; then value, less effort, A–Z.
    const goalTier = (o: Opportunity) => {
      if (o.id === MIN_WAGE_ID && shortfall > 0) return -1;
      const i = userGoals.findIndex((g) => o.goalAlignment.includes(g));
      return i < 0 ? userGoals.length : i;
    };
    const byValue = (a: Opportunity, b: Opportunity) =>
      goalTier(a) - goalTier(b)
      || cosFlagRank(a) - cosFlagRank(b)        // in demand, then industry endorsed — ahead of higher pay figures
      || display(b).gainAmount - display(a).gainAmount
      || effortHoursOf(a) - effortHoursOf(b)
      || titleOf(a).localeCompare(titleOf(b));
    const list = [...active, ...pending];
    const buckets: EffortBucket[] = EFFORT_ORDER
      .map((effort) => ({ effort, items: list.filter((o) => effortOf(o) === effort).sort(byValue) }))
      .filter((b) => b.items.length > 0);

    return {
      suggested, accepted, active, done, pending, rejected, everything,
      buckets, goalsOf, userGoals,
      /** Title worded for `goal` when given, else for the user's most important goal it helps */
      titleOf,
      isInPlan: (o: Opportunity) => planDecisions[o.id] === 'in_plan',
      isSuggested: (o: Opportunity) => suggestedIds.has(o.id),
      isNew: (o: Opportunity) => !planDecisions[o.id] && !planMeta[o.id]?.firstSeen,
      stepsDone: (o: Opportunity) => (planMeta[o.id]?.stepsDone ?? []).filter((i) => i < o.steps.length).length,
      planBoost: boostOf(accepted).total,
      potentialBoost: boostOf([...accepted, ...pending]).total,
      display,
      shortfall,
    };
  }, [allByGoal, userGoals, display, all, boostOf, planDecisions, planMeta, shortfall, lang]);
}
