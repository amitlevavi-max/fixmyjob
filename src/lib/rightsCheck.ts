/**
 * Claim my rights — the rules engine (spec "Claim My Rights", 2026-10-21).
 *
 * For every right it combines the state rule with the user's answers and gives
 * one of five statuses:
 *   owed         – rule + answers point to a shortfall ("Likely owed")
 *   check        – the rule applies, answers missing ("Need to know more")
 *   fine         – answers say the user gets this ("Looks fine")
 *   not_required – only a contract or employer policy can give it
 *   na           – doesn't apply (not shown), e.g. a contractor's wage rights
 *
 * Dollar amounts only come from the law × the user's own answers (Amit's rule:
 * no number without a source), and are always "at least" figures. Minimum wage
 * and overtime come from the existing engine (lib/wageCheck) so every screen
 * shows the same numbers.
 */
import { useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import { useMinimumWageCheck } from './useMinimumWageCheck';
import { defaultSchedule, type WageCheckResult, type WorkSchedule } from './wageCheck';
import { STATE_WAGE_LAWS } from '../data/wageLaws';
import { paidSickLeaveRule } from '../data/stateRights';
import {
  MEAL_BREAK, REST_BREAK, REPORTING_PAY, MISSED_BREAK_PREMIUM_STATES, ruleFor, type WorkRule,
} from '../data/stateWorkRules';
import { contractorScore, type QKey, type RightsFacts } from './rightsFacts';
import type { Effort, Opportunity } from '../data/opportunityCatalog';
import { t } from '../i18n';

export type RightStatus = 'owed' | 'check' | 'fine' | 'not_required' | 'na';
export type RightId =
  | 'minimum_wage' | 'weekly_overtime' | 'daily_overtime' | 'meal_breaks' | 'rest_breaks' | 'unpaid_time'
  | 'deductions' | 'reporting_pay' | 'sick_leave' | 'misclassification' | 'premium' | 'late_pay'
  | 'retaliation' | 'safety';

export interface RightCheck {
  id: RightId;
  /** Short name for lists ("Overtime pay") */
  name: string;
  status: RightStatus;
  /** Yearly amount for 'owed' (0 when it can't be worked out) */
  yearly: number;
  /** One line on why it has this status */
  why: string;
  /** The rule in the user's state, when there is one */
  rule?: string;
  cite?: string;
  /** Questions still to answer for this right (skipped ones left out) */
  questions: QKey[];
  /** Questions the user skipped (offered again with "Answer now") */
  skippedQuestions: QKey[];
  effort: Effort;
}

/** FLSA: salaried workers paid under this a week are owed overtime whatever their duties */
export const FLSA_SALARY_THRESHOLD_WEEKLY = 684;
/** Employer share of Social Security + Medicare (FICA) a contractor pays themselves */
export const EMPLOYER_FICA = 0.0765;

const round10 = (n: number) => Math.round(n / 10) * 10;

interface Inputs {
  facts: RightsFacts;
  schedule: WorkSchedule;
  annual: number;
  state: string | null;
  stateName: string | null;
  employer?: string;
  mw: WageCheckResult;
}

export function checkRights(x: Inputs): RightCheck[] {
  const { facts: f, schedule, annual, state, mw } = x;
  const place = x.stateName ?? t('your state');
  const skipped = new Set(f.skipped ?? []);
  const answered = (k: QKey): boolean => {
    if (k === 'hoursPerWeek' || k === 'daysPerWeek') return (f.scheduleAsked ?? []).includes(k);
    if (k === 'employer') return !!x.employer;
    const v = (f as Record<string, unknown>)[k];
    return v !== undefined && v !== null;
  };
  const need = (keys: QKey[]) => ({
    questions: keys.filter((k) => !answered(k) && !skipped.has(k)),
    skippedQuestions: keys.filter((k) => !answered(k) && skipped.has(k)),
  });
  const shifts = f.shifts ?? [];
  const concerns = f.concerns ?? [];
  const law = state ? STATE_WAGE_LAWS[state] : undefined;
  const hours = schedule.hoursPerWeek;
  const days = Math.max(1, schedule.daysPerWeek);
  const rate = mw.baseHourly;
  const legalRate = Math.max(rate, mw.minimum.rate);
  const out: RightCheck[] = [];
  const add = (r: Omit<RightCheck, 'questions' | 'skippedQuestions' | 'effort'> & { keys?: QKey[]; effort?: Effort }) => {
    const { keys = [], effort = 'quick', ...rest } = r;
    const n = need(keys);
    // Answers still missing → "check", unless the result is already decided
    out.push({ ...rest, ...n, effort });
  };

  // ── Employee or contractor? (gateway for the wage rights) ────────────────
  const wt = f.workType;
  const contractorish = wt === '1099' || wt === 'cash' || wt === 'unsure';
  const score = contractorScore(f);
  const cKeys: QKey[] = ['cSchedule', 'cRefuse', 'cTools', 'cOthers', 'cCore'];
  let misStatus: RightStatus = 'na';
  if (contractorish) {
    if (score.employeeLike >= 3) misStatus = 'owed';
    else if (score.answered - score.employeeLike >= 3) misStatus = 'fine';
    else misStatus = 'check';
  }
  const covered = !contractorish || misStatus === 'owed';
  add({
    id: 'misclassification', name: t('Employee or contractor?'), status: misStatus,
    yearly: misStatus === 'owed' ? round10(annual * EMPLOYER_FICA) : 0,
    why: misStatus === 'owed'
      ? t('Your answers point to being an employee. As an employee, your employer pays half your Social Security and Medicare tax (7.65% of pay), and wage laws cover you.')
      : misStatus === 'fine'
      ? t('Your answers fit a real contractor: you control how and when you work.')
      : t('Contractors aren’t covered by most wage laws — but many people paid as contractors are really employees. 5 quick questions will tell.'),
    keys: cKeys, effort: 'effort',
  });

  // ── Minimum wage ─────────────────────────────────────────────────────────
  const minNA = !covered;
  add({
    id: 'minimum_wage', name: t('Minimum wage'),
    status: minNA ? 'na' : mw.minimumShortfall > 0 ? 'owed' : 'fine',
    yearly: minNA ? 0 : mw.minimumShortfall,
    why: mw.minimumShortfall > 0
      ? t('You’re paid {pay}/hr — the legal minimum in {place} is {min}/hr.', { pay: `$${rate.toFixed(2)}`, place, min: `$${mw.minimum.rate.toFixed(2)}` })
      : t('Your pay of {pay}/hr is at or above the {min}/hr minimum.', { pay: `$${rate.toFixed(2)}`, min: `$${mw.minimum.rate.toFixed(2)}` }),
    rule: t('{min}/hr in {place}', { min: `$${mw.minimum.rate.toFixed(2)}`, place }),
  });

  // ── Weekly overtime ──────────────────────────────────────────────────────
  {
    let status: RightStatus = 'fine';
    let why = t('You work 40 hours a week or less, so weekly overtime doesn’t come up.');
    let keys: QKey[] = [];
    let yearly = 0;
    const salaried = f.payUnit === 'salary';
    if (!covered) status = 'na';
    else if (hours > 40) {
      if (salaried && f.salariedDuties === undefined) {
        status = 'check'; keys = ['salariedDuties']; why = t('Salaried workers who do hands-on work are usually still owed overtime.');
      } else if (salaried && f.salariedDuties === 'supervise' && annual / 52 >= FLSA_SALARY_THRESHOLD_WEEKLY) {
        status = 'not_required';
        why = t('Salaried supervisors paid over ${amount} a week can be exempt from overtime.', { amount: FLSA_SALARY_THRESHOLD_WEEKLY });
      } else if (f.otPay === undefined || f.otPay === 'unsure') {
        status = 'check'; keys = ['otPay'];
        why = f.otPay === 'unsure'
          ? t('Look for an overtime line on your pay stub — hours over 40 must be paid at 1.5×.')
          : t('You work over 40 hours. Hours over 40 must be paid at 1.5×.');
      } else if (f.otPay === '1.5') {
        why = t('Your hours over 40 are paid at time and a half.');
      } else {
        status = 'owed';
        yearly = mw.overtimeShortfall;
        why = t('You work about {h} hours a week. The {ot} hours over 40 must be paid at 1.5×.', { h: hours, ot: Math.round(hours - 40) });
      }
    }
    add({ id: 'weekly_overtime', name: t('Overtime pay'), status, yearly, why, keys, rule: t('1.5× pay after 40 hours a week (federal law)') });
  }

  // ── Daily overtime (only states that have it) ────────────────────────────
  if (law?.dailyOvertimeAfter) {
    const thr = law.dailyOvertimeAfter;
    const dt = law.doubleTimeAfter ?? Infinity;
    const rule = t('1.5× after {h} hours in a day', { h: thr }) + (law.doubleTimeAfter ? ` · ${t('2× after {h} hours', { h: law.doubleTimeAfter })}` : '');
    let status: RightStatus = 'fine';
    let why = t('No shifts over {h} hours.', { h: thr });
    let keys: QKey[] = [];
    let yearly = 0;
    const longShifts = shifts.includes('over8') || shifts.includes('over12');
    if (!covered) status = 'na';
    else if (longShifts) {
      keys = ['longShiftDays', 'longShiftHours', 'otPay'];
      const n = need(keys);
      if (f.longShiftDays === 0) { status = 'fine'; keys = []; }
      else if (n.questions.length || n.skippedQuestions.length || f.otPay === 'unsure') {
        status = 'check'; why = t('In {place}, long shifts earn overtime even in a short week.', { place });
      } else {
        const paid = f.otPay === '1.5' ? 1.5 : f.otPay === 'same' ? 1 : 0;
        const len = f.longShiftHours ?? 0;
        const dailyHours = (Math.max(0, Math.min(len, dt) - thr) + Math.max(0, len - dt)) * (f.longShiftDays ?? 0);
        const already = mw.overtimeHours + mw.doubleTimeHours;   // counted in weekly overtime
        const extra = Math.max(0, dailyHours - already);
        const owed = paid >= 1.5 ? 0 : extra * legalRate * (1.5 - paid) * 52;
        if (owed > 0) {
          status = 'owed'; yearly = round10(owed);
          why = t('{d} long shifts a week of about {h} hours: the hours over {thr} must be paid at 1.5×.', { d: f.longShiftDays ?? 0, h: len, thr });
        } else {
          why = paid >= 1.5 ? t('Your long-shift hours are paid at time and a half.') : t('Your long-shift hours are already counted in your weekly overtime.');
        }
      }
    }
    add({ id: 'daily_overtime', name: t('Daily overtime'), status, yearly, why, keys, rule, cite: law.dailyOvertimeNote });
  }

  // ── Meal and rest breaks ─────────────────────────────────────────────────
  const breakRight = (id: 'meal_breaks' | 'rest_breaks', table: Record<string, WorkRule>, key: 'mealBreak' | 'restBreaks', name: string) => {
    const rule = ruleFor(table, state);
    const limited = state ? table[state]?.limited : false;
    const v = f[key];
    let status: RightStatus;
    let why: string;
    let yearly = 0;
    if (!covered) { status = 'na'; why = ''; }
    else if (!rule) {
      status = 'not_required';
      why = limited
        ? t('{place}: {rule} — not most workers.', { place, rule: t(table[state!].text) })
        : t('{place} doesn’t require these breaks for adults — only your employer’s policy or a contract can.', { place });
    } else if (v === undefined || v === 'unsure') {
      status = 'check'; why = t('{place}: {rule}.', { place, rule: t(rule.text) });
    } else if (v === 'always') {
      status = 'fine'; why = t('You get the breaks {place} requires.', { place });
    } else {
      status = 'owed';
      why = t('{place} requires them: {rule}.', { place, rule: t(rule.text) });
      if (state && MISSED_BREAK_PREMIUM_STATES.has(state)) {
        const missedDays = v === 'never' ? days : 1;   // "sometimes" = at least 1 day a week
        yearly = round10(legalRate * missedDays * 52);
        why += ' ' + t('California pays one extra hour of pay for each day a break is missed.');
      }
    }
    add({ id, name, status, yearly, why, keys: rule ? [key] : [], rule: rule ? t(rule.text) : undefined, cite: rule?.cite });
  };
  breakRight('meal_breaks', MEAL_BREAK, 'mealBreak', t('Meal breaks'));
  breakRight('rest_breaks', REST_BREAK, 'restBreaks', t('Rest breaks'));

  // ── Unpaid work time (asked about when the user flagged it) ──────────────
  if (concerns.includes('unpaidHours') || (f.unpaidKinds?.length ?? 0) > 0) {
    const keys: QKey[] = ['unpaidKinds', 'unpaidMinutes'];
    let status: RightStatus = 'check';
    let yearly = 0;
    let why = t('Time you’re required to spend at work counts as paid time — security checks, putting on gear, waiting, required training.');
    if (!covered) status = 'na';
    else if (f.unpaidKinds && f.unpaidKinds.length === 0) { status = 'fine'; why = t('You’re paid for all your time at work.'); }
    else if (f.unpaidKinds?.length && f.unpaidMinutes) {
      status = 'owed';
      const mult = hours >= 40 ? 1.5 : 1;
      yearly = round10((f.unpaidMinutes / 60) * days * 52 * legalRate * mult);
      why = t('About {m} unpaid minutes a day, {d} days a week.', { m: f.unpaidMinutes, d: days }) + (mult > 1 ? ' ' + t('Over 40 hours, so it counts at the overtime rate.') : '');
    }
    add({ id: 'unpaid_time', name: t('Unpaid work time'), status, yearly, why, keys });
  }

  // ── Deductions for uniform, tools, shortages ─────────────────────────────
  if (concerns.includes('deductions') || (f.deductionKinds?.length ?? 0) > 0) {
    const keys: QKey[] = ['deductionKinds', 'deductionsPerMonth'];
    let status: RightStatus = 'check';
    let yearly = 0;
    let why = t('Deductions can’t push your pay below the minimum wage.');
    if (!covered) status = 'na';
    else if (f.deductionKinds && f.deductionKinds.length === 0) { status = 'fine'; why = t('No deductions from your pay.'); }
    else if (f.deductionKinds?.length && f.deductionsPerMonth) {
      const room = Math.max(0, rate - mw.minimum.rate) * hours * 52;
      const below = f.deductionsPerMonth * 12 - room;
      if (below > 0) { status = 'owed'; yearly = round10(below); why = t('The deductions push your pay below the minimum wage.'); }
      else { status = 'fine'; why = t('They don’t push you below the minimum wage. Some states ban them anyway — ask your state labor office.'); }
    }
    add({ id: 'deductions', name: t('Pay deductions'), status, yearly, why, keys });
  }

  // ── Reporting-time pay (sent home early) ─────────────────────────────────
  if (shifts.includes('sentHome')) {
    const rule = ruleFor(REPORTING_PAY, state);
    let status: RightStatus;
    let why: string;
    if (!covered) { status = 'na'; why = ''; }
    else if (!rule) { status = 'not_required'; why = t('{place} has no reporting-time pay law for most workers.', { place }); }
    else if (f.sentHomePerMonth === undefined) { status = 'check'; why = t('{place}: {rule}.', { place, rule: t(rule.text) }); }
    else if (f.sentHomePerMonth === 0) { status = 'fine'; why = t('Not sent home early in the last month.'); }
    else { status = 'owed'; why = t('{place}: {rule}.', { place, rule: t(rule.text) }); }
    add({ id: 'reporting_pay', name: t('Reporting-time pay'), status, yearly: 0, why, keys: rule ? ['sentHomePerMonth'] : [], rule: rule ? t(rule.text) : undefined, cite: rule?.cite });
  }

  // ── Paid sick leave ──────────────────────────────────────────────────────
  {
    const rule = paidSickLeaveRule(state);
    let status: RightStatus;
    let why: string;
    if (!covered) { status = 'na'; why = ''; }
    else if (!rule) { status = 'not_required'; why = t('{place} has no statewide paid sick leave law.', { place }); }
    else if (f.sickLeave === undefined || f.sickLeave === 'unsure') { status = 'check'; why = t('{place}: {rule}.', { place, rule: t(rule) }); }
    else if (f.sickLeave === 'shown') { status = 'fine'; why = t('Your pay stub shows sick-leave hours.'); }
    else { status = 'owed'; why = t('{place}: {rule}.', { place, rule: t(rule) }); }
    add({ id: 'sick_leave', name: t('Paid sick leave'), status, yearly: 0, why, keys: rule ? ['sickLeave'] : [], rule: rule ? t(rule) : undefined });
  }

  // ── Night / weekend extra pay ────────────────────────────────────────────
  if (shifts.includes('nights') || shifts.includes('weekends')) {
    add({
      id: 'premium', name: t('Night or weekend extra pay'), status: covered ? 'not_required' : 'na', yearly: 0,
      why: law?.sundayPremium
        ? t('{place} requires extra pay for Sunday work (counted in your overtime check). Nights: only a contract or your employer’s policy.', { place })
        : t('No law in {place} requires extra pay for nights or weekends — but you can ask, and a union contract can require it.', { place }),
      keys: ['premiumOthers'],
    });
  }

  // ── Things the user told us happened ─────────────────────────────────────
  if (concerns.includes('latePay')) {
    add({ id: 'late_pay', name: t('Paid on time'), status: 'owed', yearly: 0,
      why: t('Every state sets paydays, and late or missing pay can be claimed with your state labor office.') });
  }
  if (concerns.includes('retaliation')) {
    const kinds = f.retaliationKinds;
    add({
      id: 'retaliation', name: t('Punished for speaking up'),
      status: kinds && kinds.length === 0 ? 'fine' : kinds?.length ? 'owed' : 'check', yearly: 0,
      why: t('Your employer can’t punish you for asking about pay, safety or your rights. Some complaint deadlines are short, so act soon.'),
      keys: ['retaliationKinds', 'retaliationWhen'], effort: 'effort',
    });
  }
  if (concerns.includes('unsafe')) {
    add({ id: 'safety', name: t('Safety at work'), status: 'owed', yearly: 0,
      why: t('You have the right to a safe workplace and to report hazards confidentially to OSHA.') });
  }

  return out;
}

// ── Plan items ──────────────────────────────────────────────────────────────

const OWED_TITLES: Record<RightId, string> = {
  minimum_wage: 'Get paid the minimum wage',
  weekly_overtime: 'Get your unpaid overtime',
  daily_overtime: 'Get your daily overtime',
  meal_breaks: 'Get your meal breaks',
  rest_breaks: 'Get your rest breaks',
  unpaid_time: 'Get paid for all your hours',
  deductions: 'Get back illegal pay deductions',
  reporting_pay: 'Get reporting-time pay',
  sick_leave: 'Get your paid sick leave',
  misclassification: 'Claim employee status',
  premium: 'Ask for night or weekend extra pay',
  late_pay: 'Get your late pay',
  retaliation: 'Act on being punished for speaking up',
  safety: 'Report a safety hazard',
};
const CHECK_TITLES: Record<RightId, string> = {
  minimum_wage: 'Check your minimum wage',
  weekly_overtime: 'Check if you’re owed overtime',
  daily_overtime: 'Check your daily overtime',
  meal_breaks: 'Check your meal breaks',
  rest_breaks: 'Check your rest breaks',
  unpaid_time: 'Check for unpaid work time',
  deductions: 'Check your pay deductions',
  reporting_pay: 'Check your reporting-time pay',
  sick_leave: 'Check your paid sick leave',
  misclassification: 'Check if you’re really a contractor',
  premium: 'Ask for night or weekend extra pay',
  late_pay: 'Get your late pay',
  retaliation: 'Check if you were punished illegally',
  safety: 'Report a safety hazard',
};

type Step = Opportunity['steps'][number];
const CLAIM_STEPS: Step[] = [
  { title: 'Collect your records', detail: 'Pay stubs, schedules, texts, and your own notes of the hours you worked.' },
  { title: 'Ask your employer in writing', detail: 'Keep it short and polite, and keep a copy. Asking about your pay is protected by law.' },
  { title: 'File a free wage claim', detail: 'With the US Dept. of Labor or your state labor office — links below. Back pay can usually be claimed for 2 years (3 if willful).', action: 'report_wage_claim' },
  { title: 'Talk to a lawyer', detail: 'Many wage lawyers charge nothing unless they win.', action: 'lawyer_soon' },
];
const CHECK_STEPS: Step[] = [
  { title: 'Answer the questions above', detail: 'Each answer is saved, so you won’t be asked again.' },
  { title: 'Keep a record of your hours', detail: 'Write down when you start, stop and take breaks. It’s your evidence if you need it.' },
];
const SPECIAL_STEPS: Partial<Record<RightId, Step[]>> = {
  misclassification: [
    { title: 'Collect your records', detail: 'Your contract or app terms, schedules, messages telling you how to do the work, and your 1099s.' },
    { title: 'Ask the IRS to decide', detail: 'Free: file IRS Form SS-8 and the IRS decides whether you’re an employee or a contractor.', url: 'https://www.irs.gov/forms-pubs/about-form-ss-8' },
    { title: 'File with your state labor office', detail: 'They can order back pay and overtime if you were really an employee — links below.', action: 'report_wage_claim' },
    { title: 'Talk to a lawyer', detail: 'Misclassification cases are often taken on with no upfront fee.', action: 'lawyer_soon' },
  ],
  retaliation: [
    { title: 'Write down what happened', detail: 'Dates, who said what, and any messages. Keep copies outside work.' },
    { title: 'File a complaint soon', detail: 'Some deadlines are as short as 30 days. Your state labor office or the US Dept. of Labor — links below.', action: 'report_wage_claim' },
    { title: 'Talk to a lawyer', detail: 'Retaliation cases often need a lawyer.', action: 'lawyer_soon' },
  ],
  safety: [
    { title: 'Write down the hazard', detail: 'What, where and when. Take photos only if it’s safe to.' },
    { title: 'Report it to OSHA', detail: 'Online, by phone or by mail — you can ask OSHA to keep your name confidential.', url: 'https://www.osha.gov/workers/file-complaint' },
    { title: 'Note any punishment', detail: 'If you’re punished for reporting, you have 30 days to file an OSHA retaliation complaint.' },
  ],
  premium: [
    { title: 'Ask co-workers what they get', detail: 'Find out if anyone gets extra pay for nights or weekends.' },
    { title: 'Ask your manager in writing', detail: 'Ask whether there’s a night or weekend differential, and keep a copy.' },
    { title: 'Check a union contract', detail: 'If you’re covered by one, it may require extra pay.' },
  ],
};

/** A right as a plan item (id "right:<id>"); its title follows its status */
export function rightToItem(r: RightCheck): Opportunity {
  const owed = r.status === 'owed';
  const money = r.yearly > 0;
  const steps = SPECIAL_STEPS[r.id] ?? (owed ? CLAIM_STEPS : CHECK_STEPS);
  const gain = owed && money
    ? `${t('About {amount} a year.', { amount: `$${r.yearly.toLocaleString()}` })} ${r.why}`
    : r.why;
  return {
    id: `right:${r.id}`,
    title: t(owed ? OWED_TITLES[r.id] : r.status === 'check' ? CHECK_TITLES[r.id] : OWED_TITLES[r.id]),
    gain,
    gainAmount: owed ? r.yearly : 0,
    note: r.rule ?? '',
    jobFamily: 'All',
    // Pay below the legal minimum is also an "earn more" item
    goalAlignment: r.id === 'minimum_wage' ? ['claim_rights', 'earn_more'] : ['claim_rights'],
    steps: steps.map((s) => ({ ...s, title: t(s.title), detail: t(s.detail) })),
    timeline: owed ? t('1–6 months') : t('A few minutes'),
    physicalDemand: 'low',
    kind: 'pay_fix',
    source: money ? 'State and federal labor law · your answers' : undefined,
    effort: r.effort,
    effortHours: owed ? 6 : 1,
  };
}

/** Which rights become plan items: owed and to-check ones, plus "ask for extra pay" */
export const isPlanRight = (r: RightCheck) =>
  r.status === 'owed' || r.status === 'check' || (r.id === 'premium' && r.status === 'not_required');

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRightsCheck() {
  const { goals, focusGoal, rightsFacts, workSchedule, profile, locationState, locationStateName } = useUserStore();
  const mw = useMinimumWageCheck();
  const active = goals.some((g) => g.id === 'claim_rights') || focusGoal === 'claim_rights';
  return useMemo(() => {
    // Claim my rights users: every right. Everyone else: only the minimum wage
    // check (needs nothing but pay and location — decision Amit 2026-10-26).
    const all = checkRights({
      facts: rightsFacts,
      schedule: workSchedule ?? defaultSchedule(locationState),
      annual: profile.annualEarnings ?? 0,
      state: locationState,
      stateName: locationStateName,
      employer: profile.employer,
      mw,
    });
    const rights = active ? all : all.filter((r) => r.id === 'minimum_wage');
    const shown = rights.filter((r) => r.status !== 'na');
    const owed = shown.filter((r) => r.status === 'owed');
    const toCheck = shown.filter((r) => r.status === 'check');
    const items = rights.map(rightToItem);
    // Outside Claim my rights, the minimum wage item is suggested only when pay is below it
    const planIds = new Set(rights.filter((r) => (active ? isPlanRight(r) : r.status === 'owed')).map((r) => `right:${r.id}`));
    return {
      active,
      rights: shown,
      /** Every right as a plan item (any status) — so plan items stay visible */
      items,
      /** The ones to suggest */
      suggested: items.filter((o) => planIds.has(o.id)),
      owedTotal: owed.reduce((s, r) => s + r.yearly, 0),
      counts: {
        owed: owed.length,
        check: toCheck.length,
        fine: shown.filter((r) => r.status === 'fine').length,
        notRequired: shown.filter((r) => r.status === 'not_required').length,
        total: shown.length,
      },
      /** Unanswered questions across the rights still to check (each once) */
      questionsLeft: new Set(toCheck.flatMap((r) => r.questions)).size,
      /** The right to open first from "Answer N questions" */
      firstToCheck: toCheck.find((r) => r.questions.length > 0) ?? toCheck[0] ?? null,
      byId: (id: string) => rights.find((r) => `right:${r.id}` === id || r.id === id) ?? null,
      mw,
    };
  }, [active, rightsFacts, workSchedule, profile.annualEarnings, profile.employer, locationState, locationStateName, mw]);
}
