/**
 * Location wage data for geographic normalization.
 *
 * State wage indices are relative to the US national median (1.00).
 * Derived from BLS OEWS 2023 state-level median wage data across all occupations.
 * Source: https://www.bls.gov/oes/current/oessrcst.htm
 *
 * Metro areas are the major MSAs (Metropolitan Statistical Areas) in each state.
 * Metro premium is applied on top of the state index.
 *
 * How the math works:
 *   adjusted_wage = national_wage × state_index × area_multiplier
 *   percentile is then recalculated against the adjusted wage distribution.
 */

export interface StateData {
  name: string;
  abbr: string;
  /** Wage index relative to national median. 1.00 = national average. */
  wageIndex: number;
  metros: MetroArea[];
}

export interface MetroArea {
  name: string;
  /** Additional multiplier on top of state index. 1.0 = same as state average. */
  premium: number;
}

/** Applied when user selects "rural / suburban" within a state. */
export const RURAL_DISCOUNT = 0.88;

export const STATES: StateData[] = [
  // ── Northeast ────────────────────────────────────────────────────────────────
  {
    name: 'Connecticut', abbr: 'CT', wageIndex: 1.16,
    metros: [
      { name: 'Hartford', premium: 1.05 },
      { name: 'New Haven', premium: 1.03 },
      { name: 'Bridgeport / Stamford', premium: 1.12 },
    ],
  },
  {
    name: 'Maine', abbr: 'ME', wageIndex: 0.94,
    metros: [
      { name: 'Portland', premium: 1.06 },
      { name: 'Bangor', premium: 0.98 },
    ],
  },
  {
    name: 'Massachusetts', abbr: 'MA', wageIndex: 1.18,
    metros: [
      { name: 'Boston', premium: 1.12 },
      { name: 'Springfield', premium: 0.97 },
      { name: 'Worcester', premium: 1.03 },
    ],
  },
  {
    name: 'New Hampshire', abbr: 'NH', wageIndex: 1.06,
    metros: [
      { name: 'Manchester', premium: 1.05 },
      { name: 'Nashua', premium: 1.07 },
    ],
  },
  {
    name: 'New Jersey', abbr: 'NJ', wageIndex: 1.14,
    metros: [
      { name: 'Newark / Jersey City', premium: 1.14 },
      { name: 'Trenton', premium: 1.05 },
      { name: 'Atlantic City', premium: 0.98 },
    ],
  },
  {
    name: 'New York', abbr: 'NY', wageIndex: 1.14,
    metros: [
      { name: 'New York City', premium: 1.28 },
      { name: 'Buffalo', premium: 0.95 },
      { name: 'Albany', premium: 1.03 },
      { name: 'Rochester', premium: 0.97 },
      { name: 'Syracuse', premium: 0.94 },
    ],
  },
  {
    name: 'Pennsylvania', abbr: 'PA', wageIndex: 1.01,
    metros: [
      { name: 'Philadelphia', premium: 1.10 },
      { name: 'Pittsburgh', premium: 1.03 },
      { name: 'Allentown', premium: 1.02 },
      { name: 'Harrisburg', premium: 1.00 },
    ],
  },
  {
    name: 'Rhode Island', abbr: 'RI', wageIndex: 1.05,
    metros: [
      { name: 'Providence', premium: 1.04 },
    ],
  },
  {
    name: 'Vermont', abbr: 'VT', wageIndex: 0.98,
    metros: [
      { name: 'Burlington', premium: 1.05 },
    ],
  },

  // ── South ────────────────────────────────────────────────────────────────────
  {
    name: 'Alabama', abbr: 'AL', wageIndex: 0.87,
    metros: [
      { name: 'Birmingham', premium: 1.08 },
      { name: 'Huntsville', premium: 1.05 },
      { name: 'Mobile', premium: 0.97 },
      { name: 'Montgomery', premium: 0.98 },
    ],
  },
  {
    name: 'Arkansas', abbr: 'AR', wageIndex: 0.84,
    metros: [
      { name: 'Little Rock', premium: 1.07 },
      { name: 'Fayetteville', premium: 1.04 },
    ],
  },
  {
    name: 'Delaware', abbr: 'DE', wageIndex: 1.04,
    metros: [
      { name: 'Wilmington', premium: 1.06 },
      { name: 'Dover', premium: 0.98 },
    ],
  },
  {
    name: 'Florida', abbr: 'FL', wageIndex: 0.96,
    metros: [
      { name: 'Miami', premium: 1.08 },
      { name: 'Orlando', premium: 1.01 },
      { name: 'Tampa', premium: 1.02 },
      { name: 'Jacksonville', premium: 0.99 },
      { name: 'Fort Lauderdale', premium: 1.06 },
      { name: 'West Palm Beach', premium: 1.04 },
    ],
  },
  {
    name: 'Georgia', abbr: 'GA', wageIndex: 0.96,
    metros: [
      { name: 'Atlanta', premium: 1.10 },
      { name: 'Savannah', premium: 0.97 },
      { name: 'Augusta', premium: 0.95 },
      { name: 'Columbus', premium: 0.93 },
    ],
  },
  {
    name: 'Kentucky', abbr: 'KY', wageIndex: 0.90,
    metros: [
      { name: 'Louisville', premium: 1.06 },
      { name: 'Lexington', premium: 1.02 },
    ],
  },
  {
    name: 'Louisiana', abbr: 'LA', wageIndex: 0.89,
    metros: [
      { name: 'New Orleans', premium: 1.04 },
      { name: 'Baton Rouge', premium: 1.02 },
      { name: 'Shreveport', premium: 0.96 },
    ],
  },
  {
    name: 'Maryland', abbr: 'MD', wageIndex: 1.12,
    metros: [
      { name: 'Baltimore', premium: 1.08 },
      { name: 'Bethesda / Rockville', premium: 1.18 },
    ],
  },
  {
    name: 'Mississippi', abbr: 'MS', wageIndex: 0.83,
    metros: [
      { name: 'Jackson', premium: 1.05 },
      { name: 'Gulfport', premium: 0.96 },
    ],
  },
  {
    name: 'North Carolina', abbr: 'NC', wageIndex: 0.94,
    metros: [
      { name: 'Charlotte', premium: 1.07 },
      { name: 'Raleigh', premium: 1.09 },
      { name: 'Durham', premium: 1.06 },
      { name: 'Greensboro', premium: 0.97 },
      { name: 'Winston-Salem', premium: 0.96 },
    ],
  },
  {
    name: 'Oklahoma', abbr: 'OK', wageIndex: 0.87,
    metros: [
      { name: 'Oklahoma City', premium: 1.06 },
      { name: 'Tulsa', premium: 1.02 },
    ],
  },
  {
    name: 'South Carolina', abbr: 'SC', wageIndex: 0.91,
    metros: [
      { name: 'Charleston', premium: 1.05 },
      { name: 'Columbia', premium: 1.02 },
      { name: 'Greenville', premium: 1.01 },
    ],
  },
  {
    name: 'Tennessee', abbr: 'TN', wageIndex: 0.91,
    metros: [
      { name: 'Nashville', premium: 1.09 },
      { name: 'Memphis', premium: 1.03 },
      { name: 'Knoxville', premium: 0.97 },
      { name: 'Chattanooga', premium: 0.98 },
    ],
  },
  {
    name: 'Texas', abbr: 'TX', wageIndex: 0.99,
    metros: [
      { name: 'Dallas / Fort Worth', premium: 1.08 },
      { name: 'Houston', premium: 1.07 },
      { name: 'Austin', premium: 1.10 },
      { name: 'San Antonio', premium: 0.97 },
      { name: 'El Paso', premium: 0.89 },
      { name: 'Lubbock', premium: 0.92 },
    ],
  },
  {
    name: 'Virginia', abbr: 'VA', wageIndex: 1.05,
    metros: [
      { name: 'Northern Virginia (DC suburbs)', premium: 1.20 },
      { name: 'Richmond', premium: 1.04 },
      { name: 'Virginia Beach / Norfolk', premium: 1.00 },
      { name: 'Roanoke', premium: 0.94 },
    ],
  },
  {
    name: 'West Virginia', abbr: 'WV', wageIndex: 0.87,
    metros: [
      { name: 'Charleston', premium: 1.05 },
      { name: 'Huntington', premium: 0.97 },
    ],
  },

  // ── Midwest ──────────────────────────────────────────────────────────────────
  {
    name: 'Illinois', abbr: 'IL', wageIndex: 1.05,
    metros: [
      { name: 'Chicago', premium: 1.14 },
      { name: 'Rockford', premium: 0.95 },
      { name: 'Peoria', premium: 0.96 },
      { name: 'Springfield', premium: 0.97 },
    ],
  },
  {
    name: 'Indiana', abbr: 'IN', wageIndex: 0.95,
    metros: [
      { name: 'Indianapolis', premium: 1.06 },
      { name: 'Fort Wayne', premium: 0.97 },
      { name: 'South Bend', premium: 0.96 },
      { name: 'Evansville', premium: 0.94 },
    ],
  },
  {
    name: 'Iowa', abbr: 'IA', wageIndex: 0.96,
    metros: [
      { name: 'Des Moines', premium: 1.06 },
      { name: 'Cedar Rapids', premium: 1.02 },
      { name: 'Davenport', premium: 0.98 },
    ],
  },
  {
    name: 'Kansas', abbr: 'KS', wageIndex: 0.93,
    metros: [
      { name: 'Wichita', premium: 1.03 },
      { name: 'Kansas City (KS)', premium: 1.05 },
    ],
  },
  {
    name: 'Michigan', abbr: 'MI', wageIndex: 1.00,
    metros: [
      { name: 'Detroit', premium: 1.09 },
      { name: 'Grand Rapids', premium: 1.00 },
      { name: 'Flint', premium: 0.95 },
      { name: 'Ann Arbor', premium: 1.06 },
      { name: 'Lansing', premium: 0.99 },
    ],
  },
  {
    name: 'Minnesota', abbr: 'MN', wageIndex: 1.07,
    metros: [
      { name: 'Minneapolis / St. Paul', premium: 1.10 },
      { name: 'Duluth', premium: 0.96 },
      { name: 'Rochester', premium: 1.03 },
    ],
  },
  {
    name: 'Missouri', abbr: 'MO', wageIndex: 0.93,
    metros: [
      { name: 'St. Louis', premium: 1.05 },
      { name: 'Kansas City', premium: 1.04 },
      { name: 'Springfield', premium: 0.93 },
    ],
  },
  {
    name: 'Nebraska', abbr: 'NE', wageIndex: 0.95,
    metros: [
      { name: 'Omaha', premium: 1.05 },
      { name: 'Lincoln', premium: 1.01 },
    ],
  },
  {
    name: 'North Dakota', abbr: 'ND', wageIndex: 0.98,
    metros: [
      { name: 'Fargo', premium: 1.04 },
      { name: 'Bismarck', premium: 1.01 },
    ],
  },
  {
    name: 'Ohio', abbr: 'OH', wageIndex: 0.97,
    metros: [
      { name: 'Columbus', premium: 1.05 },
      { name: 'Cleveland', premium: 1.04 },
      { name: 'Cincinnati', premium: 1.03 },
      { name: 'Toledo', premium: 0.97 },
      { name: 'Akron', premium: 0.98 },
      { name: 'Dayton', premium: 0.97 },
    ],
  },
  {
    name: 'South Dakota', abbr: 'SD', wageIndex: 0.91,
    metros: [
      { name: 'Sioux Falls', premium: 1.05 },
      { name: 'Rapid City', premium: 1.00 },
    ],
  },
  {
    name: 'Wisconsin', abbr: 'WI', wageIndex: 1.00,
    metros: [
      { name: 'Milwaukee', premium: 1.07 },
      { name: 'Madison', premium: 1.06 },
      { name: 'Green Bay', premium: 0.98 },
      { name: 'Racine', premium: 0.99 },
    ],
  },

  // ── West ─────────────────────────────────────────────────────────────────────
  {
    name: 'Alaska', abbr: 'AK', wageIndex: 1.09,
    metros: [
      { name: 'Anchorage', premium: 1.07 },
      { name: 'Fairbanks', premium: 1.02 },
    ],
  },
  {
    name: 'Arizona', abbr: 'AZ', wageIndex: 0.97,
    metros: [
      { name: 'Phoenix', premium: 1.06 },
      { name: 'Tucson', premium: 0.96 },
      { name: 'Mesa / Scottsdale', premium: 1.05 },
    ],
  },
  {
    name: 'California', abbr: 'CA', wageIndex: 1.16,
    metros: [
      { name: 'Los Angeles', premium: 1.12 },
      { name: 'San Francisco / Bay Area', premium: 1.32 },
      { name: 'San Diego', premium: 1.10 },
      { name: 'Sacramento', premium: 1.05 },
      { name: 'Riverside / San Bernardino', premium: 0.98 },
      { name: 'Fresno', premium: 0.94 },
    ],
  },
  {
    name: 'Colorado', abbr: 'CO', wageIndex: 1.07,
    metros: [
      { name: 'Denver / Aurora', premium: 1.10 },
      { name: 'Colorado Springs', premium: 0.98 },
      { name: 'Fort Collins', premium: 1.02 },
      { name: 'Boulder', premium: 1.08 },
    ],
  },
  {
    name: 'Hawaii', abbr: 'HI', wageIndex: 1.10,
    metros: [
      { name: 'Honolulu', premium: 1.08 },
    ],
  },
  {
    name: 'Idaho', abbr: 'ID', wageIndex: 0.94,
    metros: [
      { name: 'Boise', premium: 1.06 },
      { name: 'Idaho Falls', premium: 0.97 },
    ],
  },
  {
    name: 'Montana', abbr: 'MT', wageIndex: 0.92,
    metros: [
      { name: 'Billings', premium: 1.04 },
      { name: 'Missoula', premium: 1.01 },
      { name: 'Great Falls', premium: 0.97 },
    ],
  },
  {
    name: 'Nevada', abbr: 'NV', wageIndex: 1.02,
    metros: [
      { name: 'Las Vegas', premium: 1.06 },
      { name: 'Reno', premium: 1.04 },
    ],
  },
  {
    name: 'New Mexico', abbr: 'NM', wageIndex: 0.90,
    metros: [
      { name: 'Albuquerque', premium: 1.06 },
      { name: 'Santa Fe', premium: 1.03 },
    ],
  },
  {
    name: 'Oregon', abbr: 'OR', wageIndex: 1.07,
    metros: [
      { name: 'Portland', premium: 1.09 },
      { name: 'Salem', premium: 1.00 },
      { name: 'Eugene', premium: 0.99 },
      { name: 'Bend', premium: 1.02 },
    ],
  },
  {
    name: 'Utah', abbr: 'UT', wageIndex: 1.00,
    metros: [
      { name: 'Salt Lake City', premium: 1.07 },
      { name: 'Provo / Orem', premium: 1.01 },
      { name: 'Ogden', premium: 0.99 },
      { name: 'St. George', premium: 0.95 },
    ],
  },
  {
    name: 'Washington', abbr: 'WA', wageIndex: 1.16,
    metros: [
      { name: 'Seattle', premium: 1.18 },
      { name: 'Spokane', premium: 0.97 },
      { name: 'Tacoma', premium: 1.07 },
      { name: 'Bellevue / Redmond', premium: 1.20 },
    ],
  },
  {
    name: 'Wyoming', abbr: 'WY', wageIndex: 0.98,
    metros: [
      { name: 'Cheyenne', premium: 1.03 },
      { name: 'Casper', premium: 1.00 },
    ],
  },
  // ── District of Columbia ──────────────────────────────────────────────────────
  {
    name: 'Washington, D.C.', abbr: 'DC', wageIndex: 1.37,
    metros: [
      { name: 'Washington DC', premium: 1.05 },
    ],
  },
];

/** Look up a state by abbreviation or full name. */
export function findState(query: string): StateData | undefined {
  const q = query.trim().toUpperCase();
  return STATES.find(
    (s) => s.abbr === q || s.name.toUpperCase() === q
  );
}

/**
 * Compute a combined wage multiplier for a given location.
 * Multiply any national BLS wage by this to get the local equivalent.
 *
 * Examples:
 *   getWageMultiplier('CA', true, 'San Francisco / Bay Area')
 *     = 1.16 (CA) × 1.32 (SF premium) = 1.53
 *   getWageMultiplier('MS', false)
 *     = 0.83 (MS) × 0.88 (rural discount) = 0.73
 */
/**
 * Adjustment *within* a state (metro premium or rural discount) — use this on
 * top of state-specific BLS wages, instead of getWageMultiplier (which also
 * applies the state index and would double-count it).
 */
export function getWithinStateMultiplier(
  stateAbbr: string,
  isMetro: boolean,
  metroName?: string
): number {
  const full = getWageMultiplier(stateAbbr, isMetro, metroName);
  const state = findState(stateAbbr);
  return state ? full / state.wageIndex : full;
}

export function getWageMultiplier(
  stateAbbr: string,
  isMetro: boolean,
  metroName?: string
): number {
  const state = findState(stateAbbr);
  if (!state) return 1.0;

  const stateIdx = state.wageIndex;

  if (!isMetro) {
    return stateIdx * RURAL_DISCOUNT;
  }

  if (metroName) {
    const metro = state.metros.find((m) => m.name === metroName);
    if (metro) return stateIdx * metro.premium;
  }

  // Generic metro: use average metro premium for the state
  const avgPremium =
    state.metros.length > 0
      ? state.metros.reduce((sum, m) => sum + m.premium, 0) / state.metros.length
      : 1.05;

  return stateIdx * avgPremium;
}
