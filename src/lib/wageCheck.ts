/**
 * Minimum-wage check: turns reported annual pay + a work schedule into an
 * effective base hourly rate, and compares it with the legal minimum.
 *
 * Model (per week, 52 paid weeks):
 *   pay units = regular hours
 *             + overtime hours  × overtime multiplier   (law: ≥ 1.5×)
 *             + double-time hours × 2                    (California > 12 h/day)
 *             + weekend hours   × weekend premium        (extra on top, e.g. +0.5)
 *   base hourly rate = annual pay ÷ 52 ÷ pay units
 *
 * The base rate is what must be ≥ the minimum wage. Overtime is the larger of
 * weekly (> 40 h) and daily (state rules) overtime, so hours are never counted
 * twice. Assumes hours are spread evenly across the working days.
 */

import { FEDERAL_OVERTIME, STATE_WAGE_LAWS, applicableMinimum, ApplicableMinimum } from '../data/wageLaws';
import { t } from '../i18n';

export interface WorkSchedule {
  hoursPerWeek: number;        // default 40 (full time)
  daysPerWeek: number;         // default 5
  weekendHoursPerWeek: number; // default 0
  /** What the employer actually pays for overtime hours: 0 = not paid,
   *  1 = same rate, 1.25, 1.5 (legal minimum, default), 2 = double or more */
  overtimeMultiplier: number;
  weekendPremiumPct: number;   // default 0, or the legal Sunday premium (RI)
}

export const FULL_TIME_HOURS = 40;
export const WEEKS_PER_YEAR = 52;

/** Defaults for a state: full time, 5 days, law-minimum premiums. */
export function defaultSchedule(stateAbbr?: string | null): WorkSchedule {
  const law = stateAbbr ? STATE_WAGE_LAWS[stateAbbr] : undefined;
  return {
    hoursPerWeek: FULL_TIME_HOURS,
    daysPerWeek: 5,
    weekendHoursPerWeek: 0,
    overtimeMultiplier: FEDERAL_OVERTIME.multiplier,
    weekendPremiumPct: law?.sundayPremium ? Math.round(law.sundayPremium * 100) : 0,
  };
}

export interface WageCheckResult {
  minimum: ApplicableMinimum;
  baseHourly: number;           // effective base rate the user is paid
  regularHours: number;
  overtimeHours: number;
  doubleTimeHours: number;
  weeklyPayUnits: number;
  /** Positive = above the minimum */
  marginPerHour: number;
  belowMinimum: boolean;
  /** Overtime paid at less than the law requires (incl. not at all) */
  overtimeUnderpaid: boolean;
  /** Yearly underpayment from a base rate below the minimum wage */
  minimumShortfall: number;
  /** Yearly underpayment from overtime / required premiums paid too low */
  overtimeShortfall: number;
  /** Total estimated yearly underpayment (0 if paid what the law requires) */
  annualShortfall: number;
  /** Plain-English notes on the rules used */
  notes: string[];
}

export function checkMinimumWage(params: {
  annualEarnings: number;
  /** When the user knows their hourly base rate, it's used directly */
  hourlyRate?: number | null;
  stateAbbr?: string | null;
  isMetro?: boolean | null;
  metro?: string | null;
  schedule: WorkSchedule;
  today?: Date;
}): WageCheckResult {
  const { annualEarnings, stateAbbr, schedule } = params;
  const minimum = applicableMinimum(stateAbbr, { isMetro: params.isMetro ?? null, metro: params.metro ?? null }, params.today);
  const law = stateAbbr ? STATE_WAGE_LAWS[stateAbbr] : undefined;
  const notes: string[] = [];

  const hours = Math.max(1, schedule.hoursPerWeek);
  const days = Math.min(7, Math.max(1, schedule.daysPerWeek));
  const perDay = hours / days;

  // Weekly overtime (federal rule — applies in every state)
  const weeklyOT = Math.max(0, hours - FEDERAL_OVERTIME.weeklyThreshold);

  // Daily overtime / double time (state rules)
  let dailyOT = 0;
  let doubleTime = 0;
  if (law?.dailyOvertimeAfter && perDay > law.dailyOvertimeAfter) {
    const dtAfter = law.doubleTimeAfter ?? Infinity;
    doubleTime = perDay > dtAfter ? (perDay - dtAfter) * days : 0;
    dailyOT = (Math.min(perDay, dtAfter) - law.dailyOvertimeAfter) * days;
  }
  if (law?.dailyOvertimeNote) notes.push(law.dailyOvertimeNote);

  // Hours at a premium can't exceed total hours; use the larger overtime count
  const overtimeHours = Math.min(hours - doubleTime, Math.max(weeklyOT - doubleTime, dailyOT));
  const regularHours = Math.max(0, hours - overtimeHours - doubleTime);

  const weekendHours = Math.min(hours, Math.max(0, schedule.weekendHoursPerWeek));
  const weekendPremium = Math.max(0, schedule.weekendPremiumPct) / 100;
  if (law?.sundayPremium) notes.push(law.sundayPremiumNote ?? '');

  // What the employer actually pays (may be below the law — that's the point)
  const otMult = Math.max(0, schedule.overtimeMultiplier);
  const dtMult = otMult >= FEDERAL_OVERTIME.multiplier ? Math.max(2, otMult) : otMult;
  const weeklyPayUnits =
    regularHours + overtimeHours * otMult + doubleTime * dtMult + weekendHours * weekendPremium;

  // What the law requires for the same hours
  const legalWeekend = law?.sundayPremium ?? 0;
  const legalUnits =
    regularHours + overtimeHours * FEDERAL_OVERTIME.multiplier + doubleTime * 2 + weekendHours * legalWeekend;

  const baseHourly = params.hourlyRate && params.hourlyRate > 0
    ? params.hourlyRate
    : annualEarnings > 0 && weeklyPayUnits > 0 ? annualEarnings / WEEKS_PER_YEAR / weeklyPayUnits : 0;
  const marginPerHour = baseHourly - minimum.rate;
  const belowMinimum = baseHourly > 0 && marginPerHour < -0.005;

  // Required pay = legal rate (at least the minimum) × legal pay units.
  // Shortfall is split into the minimum-wage part and the overtime/premium part.
  const legalRate = Math.max(baseHourly, minimum.rate);
  const actualAnnual = baseHourly * weeklyPayUnits * WEEKS_PER_YEAR;
  const requiredAnnual = legalRate * legalUnits * WEEKS_PER_YEAR;
  const minimumPart = belowMinimum ? (minimum.rate - baseHourly) * weeklyPayUnits * WEEKS_PER_YEAR : 0;
  const total = baseHourly > 0 ? Math.max(0, requiredAnnual - actualAnnual) : 0;
  const round10 = (n: number) => Math.round(n / 10) * 10;
  const minimumShortfall = round10(minimumPart);
  const overtimeShortfall = round10(Math.max(0, total - minimumPart));
  const annualShortfall = minimumShortfall + overtimeShortfall;
  const overtimeUnderpaid = overtimeShortfall > 0;

  if (overtimeHours + doubleTime > 0 && otMult < FEDERAL_OVERTIME.multiplier) {
    notes.push(
      otMult === 0
        ? 'Unpaid overtime is illegal for hourly workers — every hour over 40 must be paid at 1.5×.'
        : t('Overtime at {x}× is below the legal 1.5× for hourly workers.', { x: otMult }),
    );
  }
  notes.push('Federal law: 1.5× pay for every hour over 40 in a week.');
  if (schedule.weekendPremiumPct > 0 && !law?.sundayPremium) {
    notes.push('Weekend premium is not required by law in your state — included because you said your employer pays it.');
  }

  return {
    minimum,
    baseHourly,
    regularHours,
    overtimeHours,
    doubleTimeHours: doubleTime,
    weeklyPayUnits,
    marginPerHour,
    belowMinimum,
    overtimeUnderpaid,
    minimumShortfall,
    overtimeShortfall,
    annualShortfall,
    notes: notes.filter(Boolean),
  };
}
