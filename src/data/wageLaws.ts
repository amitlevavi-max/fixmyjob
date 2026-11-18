/**
 * US minimum-wage and overtime rules used by the minimum-wage check.
 *
 * Sources (checked October 2, 2026):
 *  - US DOL Wage & Hour Division, "State Minimum Wage Laws" (updated July 1, 2026)
 *    https://www.dol.gov/agencies/whd/minimum-wage/state
 *  - Florida: $15.00 from September 30, 2026 (Amendment 2 schedule)
 *  - Daily overtime / 7th-day / Sunday rules: same DOL page, "Premium Pay
 *    After Designated Hours" for each state (AK, CA, CO, NV daily; KY 7th
 *    day; RI Sunday & holiday premium under separate RI laws) — checked
 *    2026-10-25, all match.
 *
 * Rates are effective-dated so scheduled increases switch on by themselves.
 * Add new rows (don't edit old ones) when states announce changes — most
 * change on Jan 1; DC, Oregon, Alaska on Jul 1; Florida on Sep 30.
 *
 * City/county minimums are not applied to the rate; `localMinimums` lists the
 * places that have one so the UI can tell users in those states to check
 * locally. Checked 2026-10-25 against official lists where a state keeps one
 * (WA L&I local rates, CO CDLE local minimum wages, MD Labor county minimum
 * wages, MN DLI → Minneapolis / St. Paul) and each city's or county's own
 * page elsewhere; full list cross-checked with the UC Berkeley Labor Center
 * inventory (July 2026). Not listed: Omaha / Lincoln NE (same $15 as the
 * state for adults; ordinances in court). NY and OR regional rates
 * are applied via tiers instead.
 */

export const FEDERAL_MINIMUM = 7.25;
export const FEDERAL_OVERTIME = { weeklyThreshold: 40, multiplier: 1.5 };
export const WAGE_LAWS_CHECKED = '2026-10-02';

export interface RateStep {
  effective: string;          // YYYY-MM-DD
  rate: number;               // basic state minimum, $/hr
  /** Regional tiers keyed by tier id; picked via `tierFor` */
  tiers?: Record<string, number>;
  note?: string;
}

export interface StateWageLaw {
  name: string;
  rates: RateStep[];          // ascending by date
  /** Overtime beyond the federal 40 h/week at 1.5× */
  dailyOvertimeAfter?: number;          // hours in a day
  dailyOvertimeNote?: string;
  doubleTimeAfter?: number;             // hours in a day (2×)
  seventhDayPremium?: boolean;          // 7th consecutive workday at 1.5×
  /** Premium required by law for Sunday work (fraction, e.g. 0.5 = +50%) */
  sundayPremium?: number;
  sundayPremiumNote?: string;
  /** Pick a regional tier from the user's location */
  tierFor?: (loc: { isMetro: boolean | null; metro: string | null }) => string | null;
  tierLabels?: Record<string, string>;
  /** Cities/counties in this state with their own, higher minimum wage */
  localMinimums?: string[];
}

const r = (effective: string, rate: number, note?: string, tiers?: Record<string, number>): RateStep =>
  ({ effective, rate, note, tiers });

export const STATE_WAGE_LAWS: Record<string, StateWageLaw> = {
  AL: { name: 'Alabama', rates: [r('2009-07-24', 7.25, 'No state minimum — federal applies')] },
  AK: {
    name: 'Alaska',
    rates: [r('2025-07-01', 13.0), r('2026-07-01', 14.0), r('2027-07-01', 15.0)],
    dailyOvertimeAfter: 8,
    dailyOvertimeNote: 'Alaska: 1.5× after 8 hours in a day (employers with 4+ employees)',
  },
  AZ: { name: 'Arizona',
    localMinimums: ['Flagstaff', 'Tucson'], rates: [r('2026-01-01', 15.15)] },
  AR: { name: 'Arkansas', rates: [r('2021-01-01', 11.0)] },
  CA: {
    name: 'California',
    // Biggest places first: the UI shows the first 6, then "and N more"
    localMinimums: ['Los Angeles', 'San Diego', 'San Jose', 'San Francisco', 'Oakland', 'Los Angeles County (unincorporated)', 'Alameda', 'Belmont', 'Berkeley', 'Burlingame', 'Cupertino', 'Daly City', 'East Palo Alto', 'El Cerrito', 'Emeryville', 'Foster City', 'Fremont', 'Half Moon Bay', 'Hayward', 'Los Altos', 'Malibu', 'Menlo Park', 'Milpitas', 'Mountain View', 'Novato', 'Palo Alto', 'Pasadena', 'Petaluma', 'Redwood City', 'Richmond', 'San Carlos', 'San Mateo', 'San Mateo County (unincorporated)', 'Santa Clara', 'Santa Monica', 'Santa Rosa', 'Sonoma', 'South San Francisco', 'Sunnyvale', 'West Hollywood'],
    rates: [r('2026-01-01', 16.9)],
    dailyOvertimeAfter: 8,
    doubleTimeAfter: 12,
    seventhDayPremium: true,
    dailyOvertimeNote: 'California: 1.5× after 8 h/day, 2× after 12 h/day, plus 7th-consecutive-day premium',
  },
  CO: {
    name: 'Colorado',
    localMinimums: ['Denver', 'Boulder', 'Boulder County (unincorporated)', 'Edgewater'],
    rates: [r('2026-01-01', 15.16)],
    dailyOvertimeAfter: 12,
    dailyOvertimeNote: 'Colorado: 1.5× after 12 hours in a day',
  },
  CT: { name: 'Connecticut', rates: [r('2026-01-01', 16.94)] },
  DE: { name: 'Delaware', rates: [r('2025-01-01', 15.0)] },
  DC: { name: 'District of Columbia', rates: [r('2025-07-01', 17.95), r('2026-07-01', 18.4)] },
  FL: { name: 'Florida', rates: [r('2025-09-30', 14.0), r('2026-09-30', 15.0)] },
  GA: { name: 'Georgia', rates: [r('2009-07-24', 7.25, 'State rate $5.15 — federal $7.25 applies')] },
  HI: { name: 'Hawaii', rates: [r('2026-01-01', 16.0)] },
  ID: { name: 'Idaho', rates: [r('2009-07-24', 7.25)] },
  IL: { name: 'Illinois',
    localMinimums: ['Chicago', 'Cook County'], rates: [r('2025-01-01', 15.0)] },
  IN: { name: 'Indiana', rates: [r('2009-07-24', 7.25)] },
  IA: { name: 'Iowa', rates: [r('2009-07-24', 7.25)] },
  KS: { name: 'Kansas', rates: [r('2009-07-24', 7.25)] },
  KY: {
    name: 'Kentucky',
    rates: [r('2009-07-24', 7.25)],
    seventhDayPremium: true,
    dailyOvertimeNote: 'Kentucky: 1.5× on the 7th consecutive workday',
  },
  LA: { name: 'Louisiana', rates: [r('2009-07-24', 7.25, 'No state minimum — federal applies')] },
  ME: { name: 'Maine',
    localMinimums: ['Portland', 'Rockland'], rates: [r('2026-01-01', 15.1)] },
  MD: { name: 'Maryland',
    localMinimums: ['Montgomery County', 'Howard County'], rates: [r('2024-01-01', 15.0)] },
  MA: { name: 'Massachusetts', rates: [r('2023-01-01', 15.0)] },
  MI: { name: 'Michigan', rates: [r('2026-01-01', 13.73), r('2027-01-01', 15.0)] },
  MN: { name: 'Minnesota',
    localMinimums: ['Minneapolis', 'St. Paul'], rates: [r('2026-01-01', 11.41)] },
  MS: { name: 'Mississippi', rates: [r('2009-07-24', 7.25, 'No state minimum — federal applies')] },
  MO: { name: 'Missouri', rates: [r('2026-01-01', 15.0)] },
  MT: { name: 'Montana', rates: [r('2026-01-01', 10.85, 'Businesses with $110k+ annual sales')] },
  NE: { name: 'Nebraska', rates: [r('2026-01-01', 15.0)] },
  NV: {
    name: 'Nevada',
    rates: [r('2024-07-01', 12.0)],
    dailyOvertimeAfter: 8,
    dailyOvertimeNote: 'Nevada: 1.5× after 8 h/day if you earn under 1.5× the minimum wage',
  },
  NH: { name: 'New Hampshire', rates: [r('2009-07-24', 7.25)] },
  NJ: {
    name: 'New Jersey',
    rates: [r('2026-01-01', 15.92, 'Small (<6 employees) & seasonal employers: $15.23')],
  },
  NM: { name: 'New Mexico',
    localMinimums: ['Santa Fe', 'Santa Fe County', 'Las Cruces'], rates: [r('2023-01-01', 12.0)] },
  NY: {
    name: 'New York',
    rates: [r('2026-01-01', 16.0, undefined, { downstate: 17.0, upstate: 16.0 })],
    tierFor: ({ metro }) => (metro === 'New York City' ? 'downstate' : 'upstate'),
    tierLabels: { downstate: 'NYC, Long Island & Westchester', upstate: 'Rest of New York State' },
  },
  NC: { name: 'North Carolina', rates: [r('2009-07-24', 7.25)] },
  ND: { name: 'North Dakota', rates: [r('2009-07-24', 7.25)] },
  OH: { name: 'Ohio', rates: [r('2026-01-01', 11.0, 'Employers with $405k+ gross receipts')] },
  OK: { name: 'Oklahoma', rates: [r('2009-07-24', 7.25)] },
  OR: {
    name: 'Oregon',
    rates: [
      r('2025-07-01', 15.05, undefined, { portland: 16.3, standard: 15.05, nonurban: 14.05 }),
      r('2026-07-01', 15.55, undefined, { portland: 16.8, standard: 15.55, nonurban: 14.55 }),
    ],
    tierFor: ({ isMetro, metro }) =>
      metro === 'Portland' ? 'portland' : isMetro === false ? 'nonurban' : 'standard',
    tierLabels: { portland: 'Portland metro', standard: 'Standard', nonurban: 'Non-urban counties' },
  },
  PA: { name: 'Pennsylvania', rates: [r('2009-07-24', 7.25)] },
  RI: {
    name: 'Rhode Island',
    rates: [r('2026-01-01', 16.0)],
    sundayPremium: 0.5,
    sundayPremiumNote: 'Rhode Island: Sundays and certain holidays are paid at 1.5× (some employers exempt)',
  },
  SC: { name: 'South Carolina', rates: [r('2009-07-24', 7.25, 'No state minimum — federal applies')] },
  SD: { name: 'South Dakota', rates: [r('2026-01-01', 11.85)] },
  TN: { name: 'Tennessee', rates: [r('2009-07-24', 7.25, 'No state minimum — federal applies')] },
  TX: { name: 'Texas', rates: [r('2009-07-24', 7.25)] },
  UT: { name: 'Utah', rates: [r('2009-07-24', 7.25)] },
  VT: { name: 'Vermont', rates: [r('2026-01-01', 14.42)] },
  VA: { name: 'Virginia', rates: [r('2026-01-01', 12.77)] },
  WA: { name: 'Washington',
    localMinimums: ['Seattle', 'SeaTac', 'Tukwila', 'Renton', 'Burien', 'Everett', 'Bellingham', 'King County (unincorporated)'], rates: [r('2026-01-01', 17.13)] },
  WV: { name: 'West Virginia', rates: [r('2016-01-01', 8.75)] },
  WI: { name: 'Wisconsin', rates: [r('2009-07-24', 7.25)] },
  WY: { name: 'Wyoming', rates: [r('2009-07-24', 7.25, 'State rate $5.15 — federal $7.25 applies')] },
};

export interface ApplicableMinimum {
  rate: number;
  stateName: string | null;
  tierLabel?: string;
  effective: string | null;
  note?: string;
  /** Next scheduled change, if any */
  next?: { effective: string; rate: number };
  isFederal: boolean;
}

/** Minimum wage that applies today (state or federal, whichever is higher). */
export function applicableMinimum(
  stateAbbr: string | null | undefined,
  loc: { isMetro: boolean | null; metro: string | null } = { isMetro: null, metro: null },
  today: Date = new Date(),
): ApplicableMinimum {
  const law = stateAbbr ? STATE_WAGE_LAWS[stateAbbr] : undefined;
  if (!law) {
    return { rate: FEDERAL_MINIMUM, stateName: null, effective: '2009-07-24', isFederal: true };
  }
  const iso = today.toISOString().slice(0, 10);
  const current = [...law.rates].reverse().find((s) => s.effective <= iso) ?? law.rates[0];
  const upcoming = law.rates.find((s) => s.effective > iso);
  const tier = law.tierFor?.(loc) ?? null;
  const stateRate = tier && current.tiers?.[tier] !== undefined ? current.tiers[tier] : current.rate;
  const nextRate = upcoming ? (tier && upcoming.tiers?.[tier] !== undefined ? upcoming.tiers[tier] : upcoming.rate) : undefined;
  const rate = Math.max(stateRate, FEDERAL_MINIMUM);
  return {
    rate,
    stateName: law.name,
    tierLabel: tier ? law.tierLabels?.[tier] : undefined,
    effective: current.effective,
    note: current.note,
    next: upcoming && nextRate !== undefined ? { effective: upcoming.effective, rate: nextRate } : undefined,
    isFederal: stateRate <= FEDERAL_MINIMUM,
  };
}
