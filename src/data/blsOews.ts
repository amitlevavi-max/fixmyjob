/**
 * BLS Occupational Employment and Wage Statistics (OEWS)
 * Source: U.S. Bureau of Labor Statistics, May 2023 National Occupational Employment and Wage Estimates
 * https://www.bls.gov/oes/current/oes_nat.htm
 *
 * Fields: annual wages at each percentile (USD)
 * P10 = bottom 10%, P25 = bottom 25%, P50 = median, P75 = top 25%, P90 = top 10%
 */

export interface OccupationWages {
  soc: string;       // SOC code
  title: string;     // BLS occupation title
  keywords: string[]; // terms users might type
  p10: number;
  p25: number;
  p50: number;       // median
  p75: number;
  p90: number;
}

export const OCCUPATIONS: OccupationWages[] = [
  // ── Food & Beverage ─────────────────────────────────────────────────────────
  {
    soc: '35-2014', title: 'Cooks, Restaurant',
    keywords: ['cook', 'chef', 'kitchen', 'line cook', 'prep cook', 'restaurant'],
    p10: 25120, p25: 29060, p50: 34840, p75: 43690, p90: 55200,
  },
  {
    soc: '35-2021', title: 'Food Preparation Workers',
    keywords: ['food prep', 'food preparation', 'food service'],
    p10: 22270, p25: 24730, p50: 29040, p75: 34670, p90: 42040,
  },
  {
    soc: '35-3031', title: 'Waiters and Waitresses',
    keywords: ['waiter', 'waitress', 'server', 'food server', 'waitstaff'],
    p10: 20910, p25: 23150, p50: 29120, p75: 39070, p90: 56410,
  },
  {
    soc: '35-3011', title: 'Bartenders',
    keywords: ['bartender', 'bar', 'mixologist'],
    p10: 21770, p25: 24580, p50: 31110, p75: 43200, p90: 62730,
  },
  {
    soc: '35-9031', title: 'Hosts and Hostesses',
    keywords: ['host', 'hostess', 'front of house'],
    p10: 19930, p25: 21890, p50: 25870, p75: 31050, p90: 40640,
  },

  // ── Retail & Sales ──────────────────────────────────────────────────────────
  {
    soc: '41-2031', title: 'Retail Salespersons',
    keywords: ['retail', 'sales associate', 'store', 'shop', 'salesperson', 'sales rep'],
    p10: 22590, p25: 27040, p50: 33580, p75: 43910, p90: 57670,
  },
  {
    soc: '41-2011', title: 'Cashiers',
    keywords: ['cashier', 'checkout', 'register', 'front end'],
    p10: 21620, p25: 23900, p50: 28240, p75: 33880, p90: 41860,
  },
  {
    soc: '41-2021', title: 'Counter and Rental Clerks',
    keywords: ['counter clerk', 'rental clerk', 'rental agent'],
    p10: 22590, p25: 26360, p50: 32410, p75: 41090, p90: 54130,
  },

  // ── Transportation & Delivery ────────────────────────────────────────────────
  {
    soc: '53-3032', title: 'Heavy and Tractor-Trailer Truck Drivers',
    keywords: ['truck driver', 'trucker', 'cdl', 'semi', 'tractor trailer', 'long haul', 'freight'],
    p10: 33960, p25: 42020, p50: 53210, p75: 68520, p90: 86970,
  },
  {
    soc: '53-3033', title: 'Light Truck Drivers',
    keywords: ['light truck', 'van driver', 'courier', 'box truck'],
    p10: 27910, p25: 33020, p50: 41030, p75: 53170, p90: 67010,
  },
  {
    soc: '53-3031', title: 'Driver/Sales Workers and Delivery Drivers',
    keywords: ['delivery driver', 'delivery', 'route driver', 'ups', 'fedex', 'amazon driver'],
    p10: 27360, p25: 32160, p50: 39290, p75: 51180, p90: 64900,
  },
  {
    soc: '53-3051', title: 'Bus Drivers, School or Special Client',
    keywords: ['bus driver', 'school bus', 'transit driver', 'bus'],
    p10: 31230, p25: 39130, p50: 49410, p75: 64140, p90: 79510,
  },
  {
    soc: '53-3041', title: 'Taxi Drivers and Chauffeurs',
    keywords: ['taxi', 'uber', 'lyft', 'rideshare', 'chauffeur', 'gig driver'],
    p10: 22700, p25: 27490, p50: 35290, p75: 48660, p90: 66130,
  },

  // ── Warehousing & Logistics ──────────────────────────────────────────────────
  {
    soc: '53-7065', title: 'Stockers and Order Fillers',
    keywords: ['stocker', 'warehouse', 'order picker', 'picker', 'picking', 'fulfillment', 'stock', 'inventory'],
    p10: 26000, p25: 30320, p50: 37060, p75: 46580, p90: 58380,
  },
  {
    soc: '53-7051', title: 'Industrial Truck and Tractor Operators',
    keywords: ['forklift', 'forklift operator', 'pallet jack', 'reach truck', 'warehouse equipment'],
    p10: 30580, p25: 36260, p50: 43790, p75: 54490, p90: 65980,
  },
  {
    soc: '51-9111', title: 'Packaging and Filling Machine Operators',
    keywords: ['packer', 'packaging', 'production', 'assembly line', 'manufacturing worker'],
    p10: 24720, p25: 29190, p50: 35240, p75: 43620, p90: 54830,
  },

  // ── Construction & Trades ────────────────────────────────────────────────────
  {
    soc: '47-2061', title: 'Construction Laborers',
    keywords: ['construction', 'laborer', 'construction worker', 'site worker', 'general labor'],
    p10: 31470, p25: 38040, p50: 48580, p75: 64020, p90: 80730,
  },
  {
    soc: '47-2111', title: 'Electricians',
    keywords: ['electrician', 'electrical', 'wiring', 'electrical work'],
    p10: 37010, p25: 47920, p50: 60240, p75: 79360, p90: 101190,
  },
  {
    soc: '47-2152', title: 'Plumbers, Pipefitters, and Steamfitters',
    keywords: ['plumber', 'plumbing', 'pipefitter', 'pipefitting', 'steamfitter'],
    p10: 35600, p25: 45320, p50: 59880, p75: 79980, p90: 102730,
  },
  {
    soc: '47-2031', title: 'Carpenters',
    keywords: ['carpenter', 'carpentry', 'framing', 'woodwork', 'finish carpenter'],
    p10: 34110, p25: 43590, p50: 56350, p75: 74720, p90: 96640,
  },
  {
    soc: '47-2181', title: 'Roofers',
    keywords: ['roofer', 'roofing', 'shingles'],
    p10: 31730, p25: 39270, p50: 50240, p75: 64990, p90: 86620,
  },
  {
    soc: '47-2141', title: 'Painters, Construction and Maintenance',
    keywords: ['painter', 'painting', 'house painter', 'commercial painter'],
    p10: 30800, p25: 39320, p50: 49970, p75: 65050, p90: 84680,
  },
  {
    soc: '49-9021', title: 'Heating, Air Conditioning, and Refrigeration Mechanics',
    keywords: ['hvac', 'air conditioning', 'heating', 'refrigeration', 'ac tech', 'hvac tech'],
    p10: 35090, p25: 44840, p50: 57300, p75: 74690, p90: 96990,
  },

  // ── Auto & Mechanical ────────────────────────────────────────────────────────
  {
    soc: '49-3023', title: 'Automotive Service Technicians and Mechanics',
    keywords: ['mechanic', 'auto mechanic', 'automotive technician', 'auto tech', 'car repair'],
    p10: 30200, p25: 38920, p50: 46880, p75: 60800, p90: 79250,
  },

  // ── Manufacturing ────────────────────────────────────────────────────────────
  {
    soc: '51-4041', title: 'Machinists',
    keywords: ['machinist', 'cnc', 'cnc operator', 'machine operator', 'lathe'],
    p10: 33260, p25: 40300, p50: 50640, p75: 64350, p90: 81170,
  },
  {
    soc: '51-4121', title: 'Welders, Cutters, Solderers, and Brazers',
    keywords: ['welder', 'welding', 'cutter', 'solderer', 'metal fabricator'],
    p10: 33530, p25: 40240, p50: 48990, p75: 61590, p90: 77970,
  },
  {
    soc: '51-2098', title: 'Assemblers and Fabricators',
    keywords: ['assembler', 'assembly', 'fabricator', 'production worker'],
    p10: 27940, p25: 34130, p50: 42590, p75: 54890, p90: 70410,
  },
  {
    soc: '49-9041', title: 'Industrial Machinery Mechanics',
    keywords: ['industrial maintenance', 'maintenance mechanic', 'machine maintenance', 'millwright'],
    p10: 36810, p25: 45770, p50: 57660, p75: 73730, p90: 93980,
  },

  // ── Cleaning & Maintenance ───────────────────────────────────────────────────
  {
    soc: '37-2011', title: 'Janitors and Cleaners',
    keywords: ['janitor', 'cleaner', 'custodian', 'cleaning', 'custodial', 'janitorial'],
    p10: 22820, p25: 27560, p50: 34240, p75: 43720, p90: 57490,
  },
  {
    soc: '37-2012', title: 'Maids and Housekeeping Cleaners',
    keywords: ['maid', 'housekeeper', 'housekeeping', 'hotel cleaner', 'room attendant'],
    p10: 22000, p25: 25470, p50: 30580, p75: 37860, p90: 48310,
  },
  {
    soc: '37-3011', title: 'Landscaping and Groundskeeping Workers',
    keywords: ['landscaping', 'groundskeeper', 'lawn care', 'landscaper', 'grounds maintenance'],
    p10: 24860, p25: 29270, p50: 36180, p75: 45920, p90: 59210,
  },

  // ── Healthcare Support ───────────────────────────────────────────────────────
  {
    soc: '31-1121', title: 'Home Health and Personal Care Aides',
    keywords: ['home health aide', 'home health', 'personal care aide', 'caregiver', 'home care'],
    p10: 23350, p25: 26280, p50: 29430, p75: 33820, p90: 40260,
  },
  {
    soc: '31-1131', title: 'Nursing Assistants',
    keywords: ['cna', 'nursing assistant', 'nurse aide', 'patient care tech', 'pct'],
    p10: 26020, p25: 29900, p50: 35710, p75: 43580, p90: 54050,
  },
  {
    soc: '31-9092', title: 'Medical Assistants',
    keywords: ['medical assistant', 'ma', 'clinical assistant', 'medical office'],
    p10: 30650, p25: 35250, p50: 41030, p75: 48430, p90: 57830,
  },
  {
    soc: '29-2061', title: 'Licensed Practical and Licensed Vocational Nurses',
    keywords: ['lpn', 'lvn', 'licensed practical nurse', 'licensed vocational nurse'],
    p10: 38830, p25: 44610, p50: 54220, p75: 65120, p90: 77700,
  },
  {
    soc: '29-2052', title: 'Pharmacy Technicians',
    keywords: ['pharmacy tech', 'pharmacy technician', 'pharm tech'],
    p10: 27870, p25: 32490, p50: 39520, p75: 48880, p90: 60970,
  },

  // ── Security ─────────────────────────────────────────────────────────────────
  {
    soc: '33-9032', title: 'Security Guards',
    keywords: ['security guard', 'security', 'guard', 'security officer'],
    p10: 25000, p25: 29520, p50: 36800, p75: 47190, p90: 60850,
  },

  // ── Administrative / Office ───────────────────────────────────────────────────
  {
    soc: '43-4051', title: 'Customer Service Representatives',
    keywords: ['customer service', 'csr', 'call center', 'support rep', 'customer support'],
    p10: 28820, p25: 34030, p50: 40990, p75: 50830, p90: 65980,
  },
  {
    soc: '43-9061', title: 'Office Clerks, General',
    keywords: ['office clerk', 'admin', 'administrative', 'data entry', 'office assistant'],
    p10: 26550, p25: 31240, p50: 38670, p75: 49220, p90: 62730,
  },
  {
    soc: '43-4171', title: 'Receptionists and Information Clerks',
    keywords: ['receptionist', 'front desk', 'front office', 'desk clerk'],
    p10: 25520, p25: 29780, p50: 35780, p75: 44610, p90: 56960,
  },
  {
    soc: '43-5052', title: 'Postal Service Mail Carriers',
    keywords: ['postal worker', 'mail carrier', 'usps', 'mail man', 'mailman', 'post office'],
    p10: 47280, p25: 52810, p50: 60300, p75: 76610, p90: 87080,
  },

  // ── Personal Services ─────────────────────────────────────────────────────────
  {
    soc: '39-5012', title: 'Hairdressers, Hairstylists, and Cosmetologists',
    keywords: ['hairdresser', 'hairstylist', 'cosmetologist', 'barber', 'stylist', 'hair'],
    p10: 22760, p25: 28440, p50: 38250, p75: 55760, p90: 81430,
  },
  {
    soc: '39-9011', title: 'Childcare Workers',
    keywords: ['childcare', 'daycare', 'child care', 'babysitter', 'nanny', 'preschool teacher'],
    p10: 21080, p25: 23490, p50: 28520, p75: 35220, p90: 45780,
  },
];

// All-occupations national median (used as fallback)
export const ALL_OCCUPATIONS_BENCHMARK = {
  p10: 24260, p25: 31430, p50: 46310, p75: 72010, p90: 114200,
};

/** Score how well a free-text job description fits each occupation. */
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whole-word (optionally plural) match, so "bar" doesn't match "barista" */
const hasWord = (text: string, word: string) => new RegExp(`\\b${esc(word)}(s|es)?\\b`).test(text);

function scoreOccupation(occ: OccupationWages, query: string): number {
  let score = 0;
  if (occ.title.toLowerCase() === query) score += 100;
  let partial = false;
  for (const kw of occ.keywords) {
    if (hasWord(query, kw)) score += kw.split(' ').length * 10; // longer kw = better match
    else if (query.length >= 4 && kw.startsWith(query)) partial = true; // e.g. "elect" → electrician
  }
  if (partial) score += 5;                                  // counted once, not per keyword
  for (const word of occ.title.toLowerCase().split(/[\s,/]+/)) {
    if (word.length > 3 && hasWord(query, word.replace(/s$/, ''))) score += 8;
  }
  return score;
}

/** Occupations ranked by fit to the text (best first), only those with some fit. */
export function rankOccupations(roleInput: string, limit = 5): Array<{ occ: OccupationWages; score: number }> {
  const query = (roleInput ?? '').toLowerCase().trim();
  if (query.length < 2) return [];
  return OCCUPATIONS
    .map((occ) => ({ occ, score: scoreOccupation(occ, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Match a free-text job title to the closest BLS occupation.
 * Returns the matched occupation, or null if no reasonable match is found.
 */
export function matchOccupation(roleInput: string): OccupationWages | null {
  const [best] = rankOccupations(roleInput, 1);
  return best && best.score >= 5 ? best.occ : null;
}

/**
 * Is the best match clear enough to use without asking?
 * Needs a real keyword/title hit and a clear lead over the runner-up.
 */
export function confidentMatch(roleInput: string): OccupationWages | null {
  const [a, b] = rankOccupations(roleInput, 2);
  if (!a || a.score < 10) return null;
  if (b && a.score <= b.score * 2) return null;
  return a.occ;
}

export function occupationBySoc(soc?: string | null): OccupationWages | null {
  return soc ? OCCUPATIONS.find((o) => o.soc === soc) ?? null : null;
}

/**
 * Occupations to offer for each "line of work" chip in onboarding (the user
 * always picks one). SOCs not in the bundled list are fetched from the database.
 */
export const CATEGORY_OCCUPATIONS: Record<string, string[]> = {
  Warehouse: ['53-7065', '53-7051', '51-9111', '53-3033'],
  Logistics: ['53-7065', '53-7051', '53-3032', '53-3033'],
  Retail: ['41-2031', '41-2011', '41-2021', '53-7065'],
  Construction: ['47-2061', '47-2111', '47-2152', '47-2031', '47-2181', '47-2141'],
  Hospitality: ['35-2014', '35-2021', '35-3031', '35-3011', '35-9031', '37-2012'],
  Care: ['31-1121', '31-1131', '31-9092', '29-2061', '39-9011'],
  Cleaning: ['37-2011', '37-2012', '37-3011'],
  // Guards, supervisors, TSA screeners, casino surveillance, crossing guards, other protective service
  Security: ['33-9032', '33-1091', '33-9093', '33-9031', '33-9091', '33-9099'],
  Driving: ['53-3032', '53-3033', '53-3031', '53-3051', '53-3041'],
  Delivery: ['53-3031', '53-3033', '43-5052', '53-3032'],
  Manufacturing: ['51-2098', '51-4041', '51-4121', '51-9111', '49-9041'],
  Other: [],
};

/**
 * Calculate what percentile a given annual salary falls at
 * for a specific occupation's wage distribution.
 * Returns a number 1–99.
 */
export function calcPercentile(
  annualEarnings: number,
  wages: { p10: number; p25: number; p50: number; p75: number; p90: number }
): number {
  const { p10, p25, p50, p75, p90 } = wages;

  // Interpolate between known percentile breakpoints
  if (annualEarnings <= p10) {
    // Below P10: scale from 1 to 10
    return Math.max(1, Math.round((annualEarnings / p10) * 10));
  } else if (annualEarnings <= p25) {
    return Math.round(10 + ((annualEarnings - p10) / (p25 - p10)) * 15);
  } else if (annualEarnings <= p50) {
    return Math.round(25 + ((annualEarnings - p25) / (p50 - p25)) * 25);
  } else if (annualEarnings <= p75) {
    return Math.round(50 + ((annualEarnings - p50) / (p75 - p50)) * 25);
  } else if (annualEarnings <= p90) {
    return Math.round(75 + ((annualEarnings - p75) / (p90 - p75)) * 15);
  } else {
    // Above P90: scale from 90 to 99
    return Math.min(99, Math.round(90 + ((annualEarnings - p90) / p90) * 15));
  }
}
