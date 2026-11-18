/**
 * Claim my rights — the fixed list of facts we ask workers about, and the
 * questions that collect them (spec "Claim My Rights", 2026-10-21).
 *
 * Questions are asked about FACTS, not rights: one answer feeds every right
 * that needs it, and is never asked again. Hours per week, days per week and
 * how overtime is paid live in the work schedule (store.workSchedule) because
 * the minimum-wage / overtime engine (lib/wageCheck) already uses them; the
 * rest are saved in store.rightsFacts (table worker_rights_answers).
 *
 * Every question has "Not sure" (saved as 'unsure') and "Skip" (remembered in
 * `skipped`, so it isn't asked again until the user taps "Answer now").
 */

export type PayUnit = 'hour' | 'salary' | 'job' | 'mile' | 'tips';
export type WorkType = 'w2' | '1099' | 'both' | 'cash' | 'unsure';
export type Shift = 'over8' | 'over12' | 'nights' | 'weekends' | 'oncall' | 'split' | 'sentHome';
export type Concern =
  | 'unpaidHours' | 'noOvertime' | 'noBreaks' | 'deductions' | 'latePay' | 'unsafe' | 'misclassified' | 'retaliation';

export interface RightsFacts {
  payUnit?: PayUnit;
  workType?: WorkType;
  shifts?: Shift[];
  concerns?: Concern[];
  /** How hours over 40 are paid (also sets workSchedule.overtimeMultiplier) */
  otPay?: '1.5' | 'same' | 'none' | 'comp' | 'unsure';
  salariedDuties?: 'supervise' | 'handsOn' | 'unsure';
  longShiftDays?: number;          // days a week with a shift over 8 h
  longShiftHours?: number;         // usual length of those shifts
  mealBreak?: 'always' | 'sometimes' | 'never' | 'unsure';
  restBreaks?: 'always' | 'sometimes' | 'never' | 'unsure';
  unpaidKinds?: string[];
  unpaidMinutes?: number;          // a day
  deductionKinds?: string[];
  deductionsPerMonth?: number;     // $ (lower end of the range picked)
  sentHomePerMonth?: number;
  sickLeave?: 'shown' | 'notShown' | 'refused' | 'unsure';
  cSchedule?: 'company' | 'me' | 'unsure';
  cRefuse?: 'can' | 'cannot' | 'unsure';
  cTools?: 'company' | 'mine' | 'unsure';
  cOthers?: 'yes' | 'no' | 'unsure';
  cCore?: 'yes' | 'no' | 'unsure';
  premiumOthers?: 'yes' | 'no' | 'unsure';
  retaliationKinds?: string[];
  retaliationWhen?: 'lt30d' | '1to6m' | '6to12m' | 'gt1y' | 'unsure';
  union?: 'yes' | 'no' | 'unsure';
  /** Work-schedule questions the user answered (hours / days live in workSchedule) */
  scheduleAsked?: Array<'hoursPerWeek' | 'daysPerWeek'>;
  /** Question keys the user skipped (not asked again until "Answer now") */
  skipped?: string[];
  /** When the onboarding questions were answered (ISO) */
  answeredAt?: string;
}

/** A question key: a RightsFacts field, or a work-schedule field */
export type QKey =
  | Exclude<keyof RightsFacts, 'skipped' | 'answeredAt' | 'scheduleAsked'>
  | 'hoursPerWeek' | 'daysPerWeek' | 'employer';

export interface QOption { value: string | number; label: string }
export interface Question {
  key: QKey;
  prompt: string;
  help?: string;
  kind: 'single' | 'multi' | 'text';
  options?: QOption[];
  /** single questions: offer "Not sure" (saved as 'unsure') */
  unsure?: boolean;
}

export const SHIFT_OPTIONS: QOption[] = [
  { value: 'over8', label: 'Shifts over 8 hours' },
  { value: 'over12', label: 'Shifts over 12 hours' },
  { value: 'nights', label: 'Nights' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'oncall', label: 'On call' },
  { value: 'split', label: 'Split shifts' },
  { value: 'sentHome', label: 'Sent home early' },
];

export const CONCERN_OPTIONS: QOption[] = [
  { value: 'unpaidHours', label: 'Not paid for all my hours' },
  { value: 'noOvertime', label: 'No overtime pay' },
  { value: 'noBreaks', label: 'No breaks' },
  { value: 'deductions', label: 'Pay taken for uniform or tools' },
  { value: 'latePay', label: 'Late or missing pay' },
  { value: 'unsafe', label: 'Unsafe work' },
  { value: 'misclassified', label: 'Treated like an employee but paid as a contractor' },
  { value: 'retaliation', label: 'Punished for speaking up' },
];

export const PAY_UNIT_OPTIONS: QOption[] = [
  { value: 'hour', label: 'Per hour' },
  { value: 'salary', label: 'Salary' },
  { value: 'job', label: 'Per job or delivery' },
  { value: 'mile', label: 'Per mile' },
  { value: 'tips', label: 'Tips + wage' },
];

export const WORK_TYPE_OPTIONS: QOption[] = [
  { value: 'w2', label: 'W-2 (employee)' },
  { value: '1099', label: '1099 (contractor or app work)' },
  { value: 'both', label: 'Both' },
  { value: 'cash', label: 'Paid in cash' },
  { value: 'unsure', label: 'Not sure' },
];

/** Follow-up questions, asked inside a task ("Help us check") */
export const QUESTIONS: Record<string, Question> = {
  hoursPerWeek: {
    key: 'hoursPerWeek', kind: 'single', prompt: 'In a normal week, how many hours do you work?',
    options: [20, 30, 40, 45, 50, 55, 60, 70].map((h) => ({ value: h, label: h === 70 ? '70+' : String(h) })),
  },
  daysPerWeek: {
    key: 'daysPerWeek', kind: 'single', prompt: 'How many days a week do you usually work?',
    options: [3, 4, 5, 6, 7].map((d) => ({ value: d, label: String(d) })),
  },
  otPay: {
    key: 'otPay', kind: 'single', unsure: true,
    prompt: 'When you work over 40 hours in a week, how are the extra hours paid?',
    options: [
      { value: '1.5', label: 'Time and a half' },
      { value: 'same', label: 'Same rate as usual' },
      { value: 'none', label: 'Not paid' },
      { value: 'comp', label: 'Time off later instead' },
    ],
  },
  salariedDuties: {
    key: 'salariedDuties', kind: 'single', unsure: true,
    prompt: 'Do you mostly supervise other people, or do hands-on work?',
    help: 'Salaried workers who do hands-on work are usually still owed overtime.',
    options: [{ value: 'supervise', label: 'I mostly supervise' }, { value: 'handsOn', label: 'Mostly hands-on work' }],
  },
  longShiftDays: {
    key: 'longShiftDays', kind: 'single',
    prompt: 'How many days a week is your shift over 8 hours?',
    options: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: d, label: String(d) })),
  },
  longShiftHours: {
    key: 'longShiftHours', kind: 'single',
    prompt: 'How long are those long shifts, usually?',
    options: [{ value: 9, label: '9 hours' }, { value: 10, label: '10 hours' }, { value: 12, label: '12 hours' }, { value: 14, label: '14 hours or more' }],
  },
  mealBreak: {
    key: 'mealBreak', kind: 'single', unsure: true,
    prompt: 'On a long shift, do you get a meal break where you are fully off duty?',
    options: [{ value: 'always', label: 'Always' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'never', label: 'Never' }],
  },
  restBreaks: {
    key: 'restBreaks', kind: 'single', unsure: true,
    prompt: 'Do you get short paid breaks (about 10 minutes) during your shift?',
    options: [{ value: 'always', label: 'Always' }, { value: 'sometimes', label: 'Sometimes' }, { value: 'never', label: 'Never' }],
  },
  unpaidKinds: {
    key: 'unpaidKinds', kind: 'multi',
    prompt: 'Do you do any of these without pay?',
    options: [
      { value: 'security', label: 'Security check' },
      { value: 'gear', label: 'Putting on gear or uniform' },
      { value: 'waiting', label: 'Waiting for work' },
      { value: 'training', label: 'Required training' },
      { value: 'travel', label: 'Driving between job sites or clients' },
      { value: 'after', label: 'Staying after clock-out' },
    ],
  },
  unpaidMinutes: {
    key: 'unpaidMinutes', kind: 'single',
    prompt: 'About how much unpaid time is that on a normal day?',
    options: [{ value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 90, label: '1.5 hours or more' }],
  },
  deductionKinds: {
    key: 'deductionKinds', kind: 'multi',
    prompt: 'Does your employer take money from your pay for any of these?',
    options: [
      { value: 'uniform', label: 'Uniform' },
      { value: 'tools', label: 'Tools or equipment' },
      { value: 'shortages', label: 'Cash shortages' },
      { value: 'damage', label: 'Damage or breakage' },
      { value: 'training', label: 'Training' },
    ],
  },
  deductionsPerMonth: {
    key: 'deductionsPerMonth', kind: 'single',
    prompt: 'About how much a month?',
    options: [{ value: 10, label: '$10–25' }, { value: 25, label: '$25–50' }, { value: 50, label: '$50–100' }, { value: 100, label: 'Over $100' }],
  },
  sentHomePerMonth: {
    key: 'sentHomePerMonth', kind: 'single',
    prompt: 'In the last month, how often were you sent home early or had a shift cancelled after you arrived?',
    options: [{ value: 0, label: 'Never' }, { value: 1, label: 'Once' }, { value: 2, label: '2–3 times' }, { value: 4, label: '4 or more' }],
  },
  sickLeave: {
    key: 'sickLeave', kind: 'single', unsure: true,
    prompt: 'Does your pay stub show paid sick-leave hours?',
    options: [{ value: 'shown', label: 'Yes, it shows them' }, { value: 'notShown', label: 'No' }, { value: 'refused', label: 'I was refused sick time' }],
  },
  cSchedule: {
    key: 'cSchedule', kind: 'single', unsure: true, prompt: 'Who sets your schedule?',
    options: [{ value: 'company', label: 'The company' }, { value: 'me', label: 'I do' }],
  },
  cRefuse: {
    key: 'cRefuse', kind: 'single', unsure: true, prompt: 'Can you turn down jobs or routes without being penalized?',
    options: [{ value: 'can', label: 'Yes, I can' }, { value: 'cannot', label: 'No' }],
  },
  cTools: {
    key: 'cTools', kind: 'single', unsure: true, prompt: 'Whose vehicle, tools or uniform do you use?',
    options: [{ value: 'company', label: 'The company’s' }, { value: 'mine', label: 'My own' }],
  },
  cOthers: {
    key: 'cOthers', kind: 'single', unsure: true, prompt: 'Do you also work for other companies?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  cCore: {
    key: 'cCore', kind: 'single', unsure: true, prompt: 'Is the work you do the company’s main business?',
    help: 'For example, driving for a delivery company.',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  premiumOthers: {
    key: 'premiumOthers', kind: 'single', unsure: true,
    prompt: 'Does anyone at your work get extra pay for nights or weekends?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  retaliationKinds: {
    key: 'retaliationKinds', kind: 'multi',
    prompt: 'What happened after you spoke up?',
    options: [
      { value: 'hoursCut', label: 'Hours cut' },
      { value: 'schedule', label: 'Schedule changed' },
      { value: 'writeUp', label: 'Written up' },
      { value: 'fired', label: 'Fired' },
      { value: 'threatened', label: 'Threatened' },
    ],
  },
  retaliationWhen: {
    key: 'retaliationWhen', kind: 'single', unsure: true, prompt: 'When did it happen?',
    options: [{ value: 'lt30d', label: 'Less than a month ago' }, { value: '1to6m', label: '1–6 months ago' }, { value: '6to12m', label: '6–12 months ago' }, { value: 'gt1y', label: 'Over a year ago' }],
  },
  union: {
    key: 'union', kind: 'single', unsure: true, prompt: 'Are you covered by a union contract?',
    options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
  },
  employer: {
    key: 'employer', kind: 'text', prompt: 'Who’s your employer? (optional)',
    help: 'We use it to look for public records of wage or safety violations. It’s illegal for an employer to punish you for asking about your rights.',
  },
};

/** Employee-like answers to the five contractor questions (out of those answered) */
export function contractorScore(f: RightsFacts): { employeeLike: number; answered: number } {
  const pairs: Array<[string | undefined, string]> = [
    [f.cSchedule, 'company'], [f.cRefuse, 'cannot'], [f.cTools, 'company'], [f.cOthers, 'no'], [f.cCore, 'yes'],
  ];
  const answered = pairs.filter(([v]) => v && v !== 'unsure');
  return { employeeLike: answered.filter(([v, emp]) => v === emp).length, answered: answered.length };
}
