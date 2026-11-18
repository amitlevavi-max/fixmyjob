/**
 * US union directory — maps a worker's occupation to the national union(s)
 * that represent that profession. Used by the "Join a Labor Union" plan.
 *
 * Only profession-specific matches (Amit, 2026-11-13): a union is suggested
 * only when the user's occupation (SOC code) is one the union is known for.
 * No generic "find a union" fallback — no match means no union item.
 * Keywords are used only when we couldn't match the job to an occupation, and
 * they name professions, not broad areas ("electrician", not "construction").
 *
 * Links point at each union's national site (stable); locals are found from there.
 *
 * State and regional unions (STATE_UNIONS, researched 2026-11-13): shown only to
 * users whose work state is one the union says it works in, and before the
 * national ones. Sources are noted next to each.
 */

export interface UnionInfo {
  id: string;
  name: string;
  short: string;
  /** Said with "the" in a sentence ("Join the Teamsters") */
  withThe?: boolean;
  covers: string;          // who they represent, in plain English
  url: string;             // national site
  organizeUrl?: string;    // "start a union at your workplace" page, if known
  /** Occupations (SOC codes) the union represents; a trailing "*" matches a code prefix */
  socs: string[];
  /**
   * State or regional union: the states (postal codes) it works in. Shown only to
   * users in one of them, ahead of the national unions. Absent = national.
   */
  states?: string[];
  /**
   * Lower-case keywords matched as whole words against the user's role / job
   * category (a trailing "s" plural is allowed). End a keyword with "*" to
   * match it as a word prefix instead, e.g. "electric*" → electrician.
   */
  keywords: string[];
}

export const UNIONS: UnionInfo[] = [
  {
    id: 'unitehere',
    name: 'UNITE HERE',
    short: 'UNITE HERE',
    covers: 'Hotel, restaurant, casino, airport & food-service workers',
    url: 'https://unitehere.org/',
    organizeUrl: 'https://unitehere.org/organize-a-union/',
    // chefs, food prep supervisors, cooks (not fast food), food prep, bartenders, waiters, food servers,
    // dining room attendants, dishwashers, hosts, hotel housekeepers, hotel desk clerks, casino dealers
    socs: ['35-1011', '35-1012', '35-2012', '35-2013', '35-2014', '35-2015', '35-2021', '35-3011', '35-3031',
      '35-3041', '35-9011', '35-9021', '35-9031', '37-2012', '43-4081', '39-3011', '39-3019'],
    keywords: ['hotel housekeep*', 'housekeeper', 'waiter', 'waitress', 'bartender', 'line cook', 'prep cook',
      'dishwasher', 'busser', 'hotel', 'casino dealer'],
  },
  {
    id: 'teamsters',
    name: 'International Brotherhood of Teamsters',
    short: 'Teamsters', withThe: true,
    covers: 'Warehouse, freight, delivery & truck drivers',
    url: 'https://teamster.org/',
    // truck drivers, delivery drivers, freight movers, forklift operators, stockers / order pickers,
    // hand packers, shipping & receiving clerks, couriers
    socs: ['53-3031', '53-3032', '53-3033', '53-7062', '53-7051', '53-7065', '53-7064', '43-5071', '43-5021'],
    keywords: ['truck driver', 'trucker', 'cdl', 'delivery driver', 'forklift', 'order picker', 'picker', 'packer',
      'loader', 'warehouse associate', 'warehouse worker', 'courier'],
  },
  {
    id: 'ufcw',
    name: 'United Food & Commercial Workers',
    short: 'UFCW',
    covers: 'Grocery, retail, pharmacy & meatpacking workers',
    url: 'https://www.ufcw.org/',
    // cashiers, retail salespersons, butchers, meat cutters, slaughterers, pharmacy techs, stockers
    socs: ['41-2011', '41-2031', '51-3021', '51-3022', '51-3023', '29-2052', '53-7065'],
    keywords: ['cashier', 'grocery', 'butcher', 'meat cutter', 'meatpack*', 'pharmacy tech*', 'sales associate'],
  },
  {
    id: 'seiu',
    name: 'Service Employees International Union',
    short: 'SEIU',
    covers: 'Healthcare, home care, janitorial & security workers',
    url: 'https://www.seiu.org/',
    // home health & personal care aides, nursing assistants, orderlies, LPNs, RNs, janitors,
    // security guards, childcare workers
    socs: ['31-1120', '31-1121', '31-1122', '31-1131', '31-1132', '29-2061', '29-1141', '37-2011', '33-9032', '39-9011'],
    keywords: ['home health aide', 'personal care aide', 'caregiver', 'cna', 'nursing assistant', 'lpn', 'lvn',
      'registered nurse', 'janitor*', 'custodian', 'security guard', 'security officer', 'childcare'],
  },
  {
    id: 'ibew',
    name: 'International Brotherhood of Electrical Workers',
    short: 'IBEW',
    covers: 'Electricians & electrical workers',
    url: 'https://www.ibew.org/',
    // electricians, electricians' helpers, power-line installers
    socs: ['47-2111', '47-3013', '49-9051'],
    keywords: ['electrician', 'lineman', 'lineworker', 'wireman'],
  },
  {
    id: 'ua',
    name: 'United Association (UA)',
    short: 'UA',
    covers: 'Plumbers, pipefitters, welders & HVAC techs',
    url: 'https://ua.org/',
    // plumbers / pipefitters / steamfitters, their helpers, HVAC mechanics, welders
    socs: ['47-2152', '47-3015', '49-9021', '51-4121'],
    keywords: ['plumb*', 'pipefit*', 'pipe fitter', 'steamfit*', 'hvac', 'welder', 'sprinkler fitter'],
  },
  {
    id: 'carpenters',
    name: 'United Brotherhood of Carpenters',
    short: 'Carpenters Union', withThe: true,
    covers: 'Carpenters, millwrights, drywall & floor installers',
    url: 'https://www.carpenters.org/',
    // carpenters, their helpers, drywall installers, floor layers, carpet installers, millwrights
    socs: ['47-2031', '47-3012', '47-2081', '47-2042', '47-2041', '49-9044'],
    keywords: ['carpent*', 'millwright', 'drywall*', 'framer', 'floor installer', 'flooring installer'],
  },
  {
    id: 'liuna',
    name: "Laborers' International Union (LiUNA)",
    short: 'LiUNA',
    covers: 'Construction laborers & general site workers',
    url: 'https://www.liuna.org/',
    // construction laborers, pipelayers, hazardous materials removal
    socs: ['47-2061', '47-2151', '47-4041'],
    keywords: ['construction laborer', 'laborer', 'labourer', 'demolition'],
  },
  {
    id: 'iuoe',
    name: 'International Union of Operating Engineers',
    short: 'IUOE',
    covers: 'Heavy-equipment & crane operators',
    url: 'https://www.iuoe.org/',
    // construction equipment operators, crane operators, stationary engineers
    socs: ['47-2073', '53-7021', '51-8021'],
    keywords: ['equipment operator', 'crane operator', 'excavator operator', 'heavy equipment', 'bulldozer'],
  },
  {
    id: 'iupat',
    name: 'International Union of Painters and Allied Trades',
    short: 'IUPAT',
    covers: 'Painters, drywall finishers & glaziers',
    url: 'https://www.iupat.org/',
    // construction painters, drywall tapers, glaziers
    socs: ['47-2141', '47-2082', '47-2121'],
    keywords: ['painter', 'drywall finisher', 'taper', 'glazier'],
  },
  {
    id: 'roofers',
    name: 'United Union of Roofers, Waterproofers and Allied Workers',
    short: 'Roofers Union', withThe: true,
    covers: 'Roofers & waterproofers',
    url: 'https://unionroofers.com/',
    socs: ['47-2181', '47-3016'],
    keywords: ['roofer', 'roofing', 'waterproofer'],
  },
  {
    id: 'iam',
    name: 'International Association of Machinists and Aerospace Workers',
    short: 'IAM',
    covers: 'Machinists, mechanics & aerospace workers',
    url: 'https://www.goiam.org/',
    // machinists, industrial machinery mechanics, auto mechanics
    socs: ['51-4041', '49-9041', '49-3023'],
    keywords: ['machinist', 'machinery mechanic', 'auto mechanic', 'automotive technician', 'car mechanic'],
  },
  {
    id: 'atu',
    name: 'Amalgamated Transit Union',
    short: 'ATU',
    covers: 'Bus drivers & public transit workers',
    url: 'https://www.atu.org/',
    // school / special client bus drivers, transit bus drivers
    socs: ['53-3051', '53-3052'],
    keywords: ['bus driver', 'bus operator', 'transit operator'],
  },
  {
    id: 'nalc',
    name: 'National Association of Letter Carriers',
    short: 'NALC',
    covers: 'Postal Service letter carriers',
    url: 'https://www.nalc.org/',
    socs: ['43-5052'],
    keywords: ['mail carrier', 'letter carrier', 'postal carrier', 'mailman'],
  },
  {
    id: 'usw',
    name: 'United Steelworkers',
    short: 'USW',
    covers: 'Manufacturing, steel, paper, rubber & chemical workers',
    url: 'https://www.usw.org/',
    // metal furnace operators, pourers and casters, paper goods machine operators, welders
    socs: ['51-4051', '51-4052', '51-9196', '51-4121'],
    keywords: ['steelworker', 'steel mill', 'paper mill'],
  },
];

/**
 * State and regional unions (researched 2026-11-13). Each lists the states its
 * own site or reliable reporting says it works in; regional ones (e.g. only
 * Southern California) say so in `covers`.
 */
const HOME_CARE = ['31-1120', '31-1121', '31-1122'];
const RIDE_DRIVERS = ['53-3041', '53-3053', '53-3054'];
const RIDE_KEYWORDS = ['uber', 'lyft', 'rideshare', 'ride-share', 'ride share', 'gig driver', 'app driver'];
const HOTEL_FOOD = ['35-1011', '35-1012', '35-2012', '35-2013', '35-2014', '35-2015', '35-2021', '35-3011', '35-3031',
  '35-3041', '35-9011', '35-9021', '35-9031', '37-2012', '43-4081'];
const HOTEL_FOOD_KEYWORDS = ['housekeeper', 'room attendant', 'waiter', 'waitress', 'bartender', 'line cook', 'prep cook', 'dishwasher', 'busser'];
const BUILDING = ['37-2011', '33-9032'];
const BUILDING_KEYWORDS = ['janitor*', 'custodian', 'security guard', 'security officer'];
const RN_KEYWORDS = ['registered nurse', 'rn'];

export const STATE_UNIONS: UnionInfo[] = [
  // ── Rideshare and taxi drivers ──
  {
    // Certified by California PERB on 2026-09-09 for all Uber and Lyft drivers in the state (AB 1340)
    id: 'cgwu', name: 'California Gig Workers Union (SEIU)', short: 'California Gig Workers Union', withThe: true,
    covers: 'Uber and Lyft drivers in California',
    url: 'https://cagigunion.org/', states: ['CA'], socs: RIDE_DRIVERS, keywords: RIDE_KEYWORDS,
  },
  {
    // Certified by the Massachusetts Department of Labor Relations in May 2026 (32BJ SEIU + Machinists)
    id: 'adu', name: 'App Drivers Union (32BJ SEIU and IAM)', short: 'App Drivers Union', withThe: true,
    covers: 'Uber and Lyft drivers in Massachusetts',
    url: 'https://www.appdriversunion.org/', states: ['MA'], socs: RIDE_DRIVERS, keywords: RIDE_KEYWORDS,
  },
  {
    // Machinists Union affiliate for New York City for-hire drivers (a guild: it can't bargain contracts)
    id: 'idg', name: 'Independent Drivers Guild (Machinists Union)', short: 'Independent Drivers Guild', withThe: true,
    covers: 'Uber, Lyft and other app drivers in New York City',
    url: 'https://drivingguild.org/', states: ['NY'], socs: RIDE_DRIVERS, keywords: RIDE_KEYWORDS,
  },
  {
    // AFL-CIO affiliate; yellow cab, green car, black car, livery and app drivers in NYC
    id: 'nytwa', name: 'New York Taxi Workers Alliance', short: 'Taxi Workers Alliance', withThe: true,
    covers: 'Taxi, black car and app drivers in New York City',
    url: 'https://www.nytwa.org/', states: ['NY'], socs: RIDE_DRIVERS, keywords: ['taxi', 'cab driver', 'livery', 'black car'],
  },
  // ── Healthcare and home care ──
  {
    // 1199SEIU: Massachusetts, New York, New Jersey, Maryland, Florida and Washington DC
    id: '1199seiu', name: '1199SEIU United Healthcare Workers East', short: '1199SEIU',
    covers: 'Hospital, nursing home, home care and clinic workers',
    url: 'https://www.1199seiu.org/', states: ['NY', 'NJ', 'MA', 'MD', 'DC', 'FL'],
    socs: [...HOME_CARE, '31-1131', '31-1132', '29-2061', '29-1141', '31-9092'],
    keywords: ['home health aide', 'caregiver', 'cna', 'nursing assistant', 'lpn', 'medical assistant'],
  },
  {
    // California's long-term care union (home care, nursing homes, assisted living)
    id: 'seiu2015', name: 'SEIU Local 2015', short: 'SEIU 2015',
    covers: 'Home care, nursing home and assisted living workers in California',
    url: 'https://www.seiu2015.org/', states: ['CA'], socs: [...HOME_CARE, '31-1131'],
    keywords: ['home health aide', 'personal care aide', 'caregiver', 'cna', 'nursing assistant'],
  },
  {
    // Home care and nursing home workers in Washington, Montana and Alaska
    id: 'seiu775', name: 'SEIU 775', short: 'SEIU 775',
    covers: 'Home care and nursing home workers in Washington, Montana and Alaska',
    url: 'https://seiu775.org/', states: ['WA', 'MT', 'AK'], socs: [...HOME_CARE, '31-1131'],
    keywords: ['home health aide', 'personal care aide', 'caregiver', 'cna', 'nursing assistant'],
  },
  {
    // Oregon homecare and personal support workers
    id: 'seiu503', name: 'SEIU Local 503', short: 'SEIU 503',
    covers: 'Homecare and personal support workers in Oregon',
    url: 'https://seiu503.org/', states: ['OR'], socs: HOME_CARE,
    keywords: ['home health aide', 'personal care aide', 'caregiver', 'personal support worker'],
  },
  // ── Registered nurses ──
  { id: 'cna', name: 'California Nurses Association / National Nurses United', short: 'California Nurses Association', withThe: true,
    covers: 'Registered nurses in California', url: 'https://www.calnurses.org/', states: ['CA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'nysna', name: 'New York State Nurses Association', short: 'NYSNA',
    covers: 'Registered nurses in New York', url: 'https://www.nysna.org/', states: ['NY'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'massnurses', name: 'Massachusetts Nurses Association', short: 'Massachusetts Nurses Association', withThe: true,
    covers: 'Registered nurses in Massachusetts', url: 'https://www.massnurses.org/', states: ['MA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'mnnurses', name: 'Minnesota Nurses Association', short: 'Minnesota Nurses Association', withThe: true,
    covers: 'Registered nurses in Minnesota, Wisconsin, North Dakota and Iowa', url: 'https://mnnurses.org/',
    states: ['MN', 'WI', 'ND', 'IA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'wsna', name: 'Washington State Nurses Association', short: 'WSNA',
    covers: 'Registered nurses in Washington', url: 'https://www.wsna.org/', states: ['WA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'ona', name: 'Oregon Nurses Association (AFT)', short: 'Oregon Nurses Association', withThe: true,
    covers: 'Nurses and health workers in Oregon', url: 'https://www.oregonrn.org/', states: ['OR'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'pasnap', name: 'Pennsylvania Association of Staff Nurses and Allied Professionals', short: 'PASNAP',
    covers: 'Nurses and health professionals in Pennsylvania', url: 'https://www.pasnap.com/', states: ['PA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  { id: 'hpae', name: 'Health Professionals and Allied Employees (AFT)', short: 'HPAE',
    covers: 'Nurses and health workers in New Jersey and the Philadelphia area', url: 'https://hpae.org/',
    states: ['NJ', 'PA'], socs: ['29-1141'], keywords: RN_KEYWORDS },
  // ── Janitors and security officers ──
  {
    // 32BJ: MA, NH, RI, CT, NJ, NY, DE, PA, MD, Northern Virginia, DC, Southern Florida (its own site)
    id: '32bj', name: '32BJ SEIU', short: '32BJ SEIU',
    covers: 'Janitors, security officers and building workers on the East Coast',
    url: 'https://www.seiu32bj.org/', states: ['MA', 'NH', 'RI', 'CT', 'NJ', 'NY', 'DE', 'PA', 'MD', 'VA', 'DC', 'FL'],
    socs: [...BUILDING, '49-9071'], keywords: [...BUILDING_KEYWORDS, 'doorman', 'porter', 'maintenance worker'],
  },
  {
    // SEIU Local 1: Illinois, Indiana, Michigan, Missouri, Ohio (its own site)
    id: 'seiu1', name: 'SEIU Local 1', short: 'SEIU Local 1',
    covers: 'Janitors and security officers in the Midwest',
    url: 'https://www.seiu1.org/', states: ['IL', 'IN', 'MI', 'MO', 'OH'], socs: BUILDING, keywords: BUILDING_KEYWORDS,
  },
  {
    // SEIU United Service Workers West: statewide in California
    id: 'usww', name: 'SEIU United Service Workers West', short: 'SEIU-USWW',
    covers: 'Janitors, security officers and airport workers in California',
    url: 'https://www.seiu-usww.org/', states: ['CA'], socs: BUILDING, keywords: BUILDING_KEYWORDS,
  },
  // ── Hotels, casinos and restaurants ──
  {
    // UNITE HERE Local 226: Las Vegas and Reno hotel-casinos (not casino dealers)
    id: 'culinary226', name: 'Culinary Workers Union Local 226 (UNITE HERE)', short: 'Culinary Union', withThe: true,
    covers: 'Hotel and casino workers in Nevada (not dealers)',
    url: 'https://culinaryunion226.org/', states: ['NV'], socs: HOTEL_FOOD, keywords: HOTEL_FOOD_KEYWORDS,
  },
  {
    // UNITE HERE Local 11: hotels, restaurants, airports, arenas in Southern California and Arizona
    id: 'unitehere11', name: 'UNITE HERE Local 11', short: 'UNITE HERE Local 11',
    covers: 'Hotel, restaurant and airport workers in Southern California and Arizona',
    url: 'https://www.unitehere11.org/', states: ['CA', 'AZ'], socs: HOTEL_FOOD, keywords: HOTEL_FOOD_KEYWORDS,
  },
  // ── Farm work ──
  {
    // United Farm Workers: contracts in California, New York, Washington and Oregon
    id: 'ufw', name: 'United Farm Workers', short: 'UFW',
    covers: 'Farm workers in California, New York, Washington and Oregon',
    url: 'https://ufw.org/', states: ['CA', 'NY', 'WA', 'OR'], socs: ['45-2092', '45-2093', '45-2041'],
    keywords: ['farmworker', 'farm worker', 'field worker', 'harvest*'],
  },
  // ── Child care ──
  {
    // SEIU + AFSCME; certified for state-subsidized family child care providers in California
    id: 'ccpu', name: 'Child Care Providers United (SEIU and AFSCME)', short: 'Child Care Providers United',
    covers: 'Family child care providers in California',
    url: 'https://childcareprovidersunited.org/', states: ['CA'], socs: ['39-9011'], keywords: ['child care provider', 'childcare', 'daycare'],
  },
  {
    // SEIU 925: subsidized family child care providers in Washington
    id: 'seiu925', name: 'SEIU Local 925', short: 'SEIU 925',
    covers: 'Family child care providers in Washington',
    url: 'https://www.seiu925.org/', states: ['WA'], socs: ['39-9011'], keywords: ['child care provider', 'childcare', 'daycare'],
  },
];

/** Benefits union members can get (wording from Amit, 2026-11-13). They vary by union and local. */
export const UNION_BENEFITS = [
  'Access to member discounts (retail, shopping, travel, hotels etc.)',
  'Student loan assistance',
  'Legal-services plan',
  'Discounted insurance (car, home, life etc.)',
  'Education and tuition offers',
  'Free employment-law representation',
];

export function unionById(id?: string | null): UnionInfo | null {
  return id ? [...STATE_UNIONS, ...UNIONS].find((u) => u.id === id) ?? null : null;
}

export const NLRB_ELECTIONS_URL = 'https://www.nlrb.gov/about-nlrb/what-we-do/conduct-elections';

function keywordRegex(k: string): RegExp {
  const prefix = k.endsWith('*');
  const word = (prefix ? k.slice(0, -1) : k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(prefix ? `\\b${word}` : `\\b${word}s?\\b`);
}

function socMatches(pattern: string, soc: string): boolean {
  return pattern.endsWith('*') ? soc.startsWith(pattern.slice(0, -1)) : soc === pattern;
}

/**
 * The unions for the user's profession (best first, max 2): unions for the
 * user's state first, then national ones. With an occupation code: only unions
 * listing that code. Without one (the job didn't match an occupation):
 * profession keywords in the role text. Without a state: national unions only.
 */
export function findUnions(job: { soc?: string | null; role?: string | null; title?: string | null; state?: string | null }): UnionInfo[] {
  const state = job.state?.trim().toUpperCase() || null;
  // State unions first, the most specialised (fewest occupations) first; then national ones
  const pool = [
    ...STATE_UNIONS.filter((u) => !!state && !!u.states?.includes(state)).sort((a, b) => a.socs.length - b.socs.length),
    ...UNIONS,
  ];
  const soc = job.soc?.trim();
  if (soc) return pool.filter((u) => u.socs.some((p) => socMatches(p, soc))).slice(0, 2);
  const hay = [job.role, job.title].filter(Boolean).join(' ').toLowerCase();
  if (!hay.trim()) return [];
  return pool
    .map((u, i) => ({ u, i, score: u.keywords.filter((k) => keywordRegex(k).test(hay)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => (b.u.states ? 1 : 0) - (a.u.states ? 1 : 0) || b.score - a.score || a.i - b.i)
    .slice(0, 2)
    .map((x) => x.u);
}
