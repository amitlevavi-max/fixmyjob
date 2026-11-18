/**
 * State-specific labor rules shown on the Rights screens.
 *
 * Sources (checked 2026-10-02):
 *  - Tipped minimum wage: US DOL WHD, "Minimum Wages for Tipped Employees"
 *    (page updated July 1, 2026) https://www.dol.gov/agencies/whd/state/minimum-wage/tipped
 *    Stored as a rule (fixed cash wage, fixed tip credit, or % credit) so it
 *    follows the state minimum in wageLaws.ts when that changes.
 *  - Paid sick leave: each state's labor department (checked 2026-10-25 —
 *    AK DOL, AZ ICA, CA Labor Commissioner, CO CDLE, CT DOL, DC DOES, IL DOL,
 *    ME DOL, MD Labor, MA (mass.gov), MI LEO, MN DLI, NE DOL, NV Labor
 *    Commissioner, NJ DOL, NM DWS / statute, NY (ny.gov), OR BOLI, RI DLT,
 *    VT DOL, WA L&I); national overview: US DOL Women's Bureau paid sick
 *    leave map. Headline rules only — small employers and some industries
 *    have exceptions. Nebraska: LB 415 (2025) exempts 10 or fewer employees.
 *    Connecticut covers all employers from 2027-01-01.
 *  - State OSHA plans: OSHA "State Plans" list (private-sector plans).
 *  - Right-to-work: state statutes (Michigan repealed, effective Feb 2024).
 *  - EEOC deadline: 300 days where a state agency enforces a similar law,
 *    otherwise 180 days.
 */

import { applicableMinimum, STATE_WAGE_LAWS, FEDERAL_OVERTIME } from './wageLaws';
import { STATE_LABOR_OFFICES } from './laborOffices';

export const STATE_RIGHTS_CHECKED = '2026-10-02';

type TipRule =
  | { kind: 'full'; note?: string }               // no tip credit — full minimum wage
  | { kind: 'fixed'; cash: number; note?: string } // fixed cash wage
  | { kind: 'credit'; credit: number; note?: string } // minimum minus a fixed credit
  | { kind: 'pct'; creditPct: number; note?: string } // credit = % of the minimum
  | { kind: 'varies'; note: string };

const TIPPED: Record<string, TipRule> = {
  AL: { kind: 'fixed', cash: 2.13 }, AK: { kind: 'full' }, AZ: { kind: 'credit', credit: 3.0 },
  AR: { kind: 'fixed', cash: 2.63 }, CA: { kind: 'full' }, CO: { kind: 'credit', credit: 3.02 },
  CT: { kind: 'fixed', cash: 6.38, note: '$8.23 for bartenders' }, DE: { kind: 'fixed', cash: 2.23 },
  DC: { kind: 'fixed', cash: 10.3 }, FL: { kind: 'credit', credit: 3.02 }, GA: { kind: 'fixed', cash: 2.13 },
  HI: { kind: 'credit', credit: 1.25, note: 'only if wages + tips are at least $7 above the minimum' },
  ID: { kind: 'fixed', cash: 3.35 }, IL: { kind: 'pct', creditPct: 0.4 }, IN: { kind: 'fixed', cash: 2.13 },
  IA: { kind: 'pct', creditPct: 0.4 }, KS: { kind: 'fixed', cash: 2.13 }, KY: { kind: 'fixed', cash: 2.13 },
  LA: { kind: 'fixed', cash: 2.13 }, ME: { kind: 'pct', creditPct: 0.5 }, MD: { kind: 'fixed', cash: 3.63 },
  MA: { kind: 'fixed', cash: 6.75 }, MI: { kind: 'fixed', cash: 5.49 }, MN: { kind: 'full' },
  MS: { kind: 'fixed', cash: 2.13 }, MO: { kind: 'pct', creditPct: 0.5 },
  MT: { kind: 'full', note: '$4.00 at small businesses not covered by federal law' },
  NE: { kind: 'fixed', cash: 2.13 }, NV: { kind: 'full' }, NH: { kind: 'fixed', cash: 3.27 },
  NJ: { kind: 'fixed', cash: 6.05 }, NM: { kind: 'fixed', cash: 3.0 },
  NY: { kind: 'varies', note: 'Varies by region and industry — check NY Dept. of Labor' },
  NC: { kind: 'fixed', cash: 2.13 }, ND: { kind: 'pct', creditPct: 0.33 }, OH: { kind: 'pct', creditPct: 0.5 },
  OK: { kind: 'fixed', cash: 2.13 }, OR: { kind: 'full' }, PA: { kind: 'fixed', cash: 2.83 },
  RI: { kind: 'fixed', cash: 3.89 }, SC: { kind: 'fixed', cash: 2.13 }, SD: { kind: 'pct', creditPct: 0.5 },
  TN: { kind: 'fixed', cash: 2.13 }, TX: { kind: 'fixed', cash: 2.13 }, UT: { kind: 'fixed', cash: 2.13 },
  VT: { kind: 'pct', creditPct: 0.5 }, VA: { kind: 'fixed', cash: 2.13 }, WA: { kind: 'full' },
  WV: { kind: 'pct', creditPct: 0.7 }, WI: { kind: 'fixed', cash: 2.33 }, WY: { kind: 'fixed', cash: 2.13 },
};

/** Headline paid sick leave rule; states not listed have no statewide law. */
const PAID_SICK_LEAVE: Record<string, string> = {
  AK: '1 hr per 30 worked — up to 56 hrs/yr (40 at employers with under 15 staff)',
  AZ: '1 hr per 30 worked — up to 40 hrs/yr (24 at employers with under 15 staff)',
  CA: '1 hr per 30 worked — at least 40 hrs (5 days) a year',
  CO: '1 hr per 30 worked — up to 48 hrs/yr',
  CT: '1 hr per 30 worked — up to 40 hrs/yr (employers with 11+ staff; all employers from January 2027)',
  DC: 'Up to 3–7 days a year depending on employer size',
  IL: '1 hr per 40 worked — up to 40 hrs/yr, usable for any reason',
  ME: '1 hr per 40 worked — up to 40 hrs/yr (employers with more than 10 staff)',
  MD: '1 hr per 30 worked — up to 40 hrs/yr (employers with 15+ staff)',
  MA: '1 hr per 30 worked — up to 40 hrs/yr (paid at employers with 11+ staff)',
  MI: '1 hr per 30 worked — up to 72 hrs/yr (40 at employers with 10 or fewer staff)',
  MN: '1 hr per 30 worked — up to 48 hrs/yr',
  NE: '1 hr per 30 worked — up to 56 hrs/yr (40 at employers with 11–19 staff; employers with 10 or fewer are exempt)',
  NV: 'About 40 hrs/yr (employers with 50+ staff)',
  NJ: '1 hr per 30 worked — up to 40 hrs/yr',
  NM: '1 hr per 30 worked — up to 64 hrs/yr',
  NY: '1 hr per 30 worked — up to 40 hrs/yr (56 at employers with 100+ staff)',
  OR: '1 hr per 30 worked — up to 40 hrs/yr (paid at employers with 10+ staff, or 6+ with a Portland location)',
  RI: '1 hr per 35 worked — up to 40 hrs/yr (employers with 18+ staff)',
  VT: '1 hr per 52 worked — up to 40 hrs/yr',
  WA: '1 hr per 40 worked — no annual cap on earning it',
};
const SICK_LEAVE_LOCAL_ONLY: Record<string, string> = {
  PA: 'No statewide law — Philadelphia, Pittsburgh and Allegheny County have their own',
};

/** Statewide paid sick leave rule (headline), or null when the state has none */
export function paidSickLeaveRule(state: string | null | undefined): string | null {
  return state ? PAID_SICK_LEAVE[state] ?? null : null;
}

/** States running their own OSHA-approved plan for private employers */
const STATE_OSHA_PLANS = new Set([
  'AK', 'AZ', 'CA', 'HI', 'IN', 'IA', 'KY', 'MD', 'MI', 'MN', 'NV', 'NM', 'NC', 'OR', 'SC', 'TN', 'UT', 'VT', 'VA', 'WA', 'WY',
]);

const RIGHT_TO_WORK = new Set([
  'AL', 'AZ', 'AR', 'FL', 'GA', 'ID', 'IN', 'IA', 'KS', 'KY', 'LA', 'MS', 'NE', 'NV', 'NC', 'ND', 'OK', 'SC', 'SD', 'TN',
  'TX', 'UT', 'VA', 'WV', 'WI', 'WY',
]);

/** No state agency enforcing a similar anti-discrimination law → 180-day EEOC deadline */
const EEOC_180_DAY = new Set(['AL', 'AR', 'GA', 'MS']);

/** Non-competes unenforceable for most workers */
const NONCOMPETE_BANNED = new Set(['CA', 'MN', 'ND', 'OK', 'WY']);

const money = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export interface StateFact { key: string; value: string; url?: string }

export function tippedCashWage(state: string, minimum: number): { text: string } {
  const rule = TIPPED[state];
  if (!rule) return { text: `${money(2.13)}/hr cash wage if tips bring you to the minimum` };
  const note = rule.note ? ` (${rule.note})` : '';
  switch (rule.kind) {
    case 'full': return { text: `No tip credit — you must get the full ${money(minimum)}/hr before tips${note}` };
    case 'varies': return { text: rule.note };
    case 'fixed': return { text: `At least ${money(rule.cash)}/hr cash, and tips must bring you to ${money(minimum)}${note}` };
    case 'credit': return { text: `At least ${money(Math.max(minimum - rule.credit, 2.13))}/hr cash, and tips must bring you to ${money(minimum)}${note}` };
    case 'pct': return { text: `At least ${money(Math.max(minimum * (1 - rule.creditPct), 2.13))}/hr cash, and tips must bring you to ${money(minimum)}${note}` };
  }
}

/**
 * Rules for this state, per rights category. Empty when no state is known.
 */
export function stateRightsFacts(
  categoryId: string,
  state: string | null | undefined,
  loc: { isMetro: boolean | null; metro: string | null } = { isMetro: null, metro: null },
): StateFact[] {
  if (!state || !STATE_WAGE_LAWS[state]) return [];
  const law = STATE_WAGE_LAWS[state];
  const office = STATE_LABOR_OFFICES[state];
  const facts: StateFact[] = [];

  switch (categoryId) {
    case 'wages_hours': {
      const min = applicableMinimum(state, loc);
      facts.push({
        key: 'Minimum wage',
        value: `${money(min.rate)}/hr${min.tierLabel ? ` (${min.tierLabel})` : ''}${min.isFederal ? ' — the federal minimum applies' : ''}` +
          (min.next ? ` · rises to ${money(min.next.rate)} on ${fmtDate(min.next.effective)}` : ''),
      });
      facts.push({ key: 'Tipped workers', value: tippedCashWage(state, min.rate).text });
      const ot: string[] = [`${FEDERAL_OVERTIME.multiplier}× after ${FEDERAL_OVERTIME.weeklyThreshold} hrs/week`];
      if (law.dailyOvertimeAfter) ot.push(`1.5× after ${law.dailyOvertimeAfter} hrs in a day`);
      if (law.doubleTimeAfter) ot.push(`2× after ${law.doubleTimeAfter} hrs in a day`);
      if (law.seventhDayPremium) ot.push('premium on the 7th day in a row');
      if (law.sundayPremium) ot.push(`+${Math.round(law.sundayPremium * 100)}% for Sunday work${law.sundayPremiumNote ? ` (${law.sundayPremiumNote})` : ''}`);
      facts.push({ key: 'Overtime', value: ot.join(' · ') });
      if (law.localMinimums?.length) {
        const list = law.localMinimums;
        const shown = list.length > 6 ? `${list.slice(0, 6).join(', ')} and ${list.length - 6} more` : list.join(', ');
        facts.push({ key: 'Higher city minimums', value: `${shown} set their own, higher minimum` });
      }
      if (office) facts.push({ key: 'Report unpaid wages', value: office.agency, url: office.url });
      break;
    }
    case 'leave_benefits': {
      const sick = PAID_SICK_LEAVE[state];
      facts.push({
        key: 'Paid sick leave',
        value: sick ?? SICK_LEAVE_LOCAL_ONLY[state] ?? 'No statewide paid sick leave law — check your employer\'s policy',
      });
      if (office) facts.push({ key: 'Questions or complaints', value: office.agency, url: office.url });
      break;
    }
    case 'safety':
      facts.push({
        key: 'Who enforces safety',
        value: STATE_OSHA_PLANS.has(state)
          ? `${law.name} runs its own OSHA-approved safety program — complain to the state program or federal OSHA`
          : `Federal OSHA covers private employers in ${law.name}`,
        url: 'https://www.osha.gov/workers/file-complaint',
      });
      break;
    case 'discrimination':
      facts.push({
        key: 'Deadline to file with EEOC',
        value: EEOC_180_DAY.has(state)
          ? `180 days from the incident in ${law.name}`
          : `300 days from the incident in ${law.name} (a state agency also enforces anti-discrimination law)`,
        url: 'https://www.eeoc.gov/time-limits-filing-charge',
      });
      break;
    case 'termination':
      if (NONCOMPETE_BANNED.has(state)) {
        facts.push({ key: 'Non-competes', value: `Generally not enforceable for workers in ${law.name}` });
      } else {
        facts.push({ key: 'Non-competes', value: `Allowed in ${law.name} with limits — many states ban them for lower-paid workers` });
      }
      if (office) facts.push({ key: 'Final paycheck rules', value: `Set by ${office.agency}`, url: office.url });
      break;
    case 'unions':
      facts.push({
        key: 'Right-to-work',
        value: RIGHT_TO_WORK.has(state)
          ? `${law.name} is a right-to-work state — you can't be required to pay union fees to keep your job`
          : `${law.name} is not a right-to-work state — union contracts can require fees from everyone they cover`,
      });
      break;
  }
  return facts;
}
