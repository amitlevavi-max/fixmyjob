import { Goal } from '../store/userStore';

export interface Opportunity {
  id: string;
  title: string;
  gain: string;
  gainAmount: number; // annual $ increase
  note: string;
  /** Who it's mainly for: a JobFamily, or 'All' */
  jobFamily: string;
  /** Other families it also fits ('*' = anyone whose family we know or not) */
  alsoFor?: string[];
  goalAlignment: Goal[];
  /**
   * Wording for a specific goal, when the item helps several goals and
   * `title` names the benefit for only one of them. The title always says
   * how the item serves the goal it is shown under (see titleForGoal).
   */
  goalTitles?: Partial<Record<Goal, string>>;
  steps: Array<{
    title: string;
    detail: string;
    /** Renders action links under the step (e.g. government complaint forms);
     *  lawyer_soon = "Talk to a lawyer" button that isn't live yet (taps are counted) */
    action?: 'report_wage_claim' | 'relocation_jobs' | 'lawyer_soon';
    /** An official page for this step (opens in the browser) */
    url?: string;
  }>;
  timeline: string;
  physicalDemand: 'low' | 'medium' | 'high';
  courseKeyword?: string; // set when the opportunity involves enrolling in a course/program
  /**
   * When set, gain / gainAmount are placeholders and the real figure is
   * computed per user from live benchmarks (see src/lib/benchmarks.ts).
   */
  gainModel?: 'union_premium' | 'min_wage_gap' | 'relocation' | 'cert_gap';
  /**
   * Occupation (SOC) whose government-approved training programs to list
   * (DOL ETA-9171). 'current' = the user's own occupation. When set, the
   * official program list replaces the AI course finder.
   */
  trainingSoc?: string;
  /**
   * How the gain combines with others in the "potential boost" total:
   *  pay_fix     – getting paid what the law requires (stacks)
   *  add_on      – extra on top of the current job, e.g. union premium (stacks)
   *  career_move – a different job/certification; alternatives, only the best counts (default)
   *  one_off     – a one-time payment (back pay), not yearly income — excluded
   */
  kind?: 'pay_fix' | 'add_on' | 'career_move' | 'one_off';
  /**
   * One short line under the title in lists (My plan, All suggestions) that
   * says why it's worth opening, e.g. "About 9 in 10 nurses in Ohio get health
   * insurance" (Amit, 2026-11-07). Sourced on the item's own screen.
   */
  teaser?: string;
  /** Where a fixed gainAmount comes from (shown under the figure) */
  source?: string;
  /**
   * add_on items with the same group share one gain (e.g. several missing
   * credentials of the user's job all carry the same certified-vs-uncertified
   * pay difference) — the "potential boost" counts the group once.
   */
  countGroup?: string;
  /** Only one item of this group can be in the plan (one promotion, one career change) */
  exclusiveGroup?: 'promotion' | 'career_change';
  /** Promotion to the supervisor job of the user's line of work (data/careerMoves) */
  isManager?: boolean;
  /** Short-course items: the approved program (lib/shortCourses) */
  course?: import('../lib/shortCourses').ShortCourse;
  /** Stand-in item when no short course was found: its screen asks for ZIP and driving distance */
  courseSearch?: boolean;
  /** Promotions: is there a training or college program for the job near the user (lib/promotionPaths)? undefined = still checking */
  pathNear?: 'yes' | 'no' | 'unknown';
  /** Credential this item is about (data items 'cred:…') — "I already have this" */
  credentialName?: string;
  /** Occupation (SOC) and short job name of a promotion / career change target */
  targetSoc?: string;
  /** "nurse midwife" (one person) / "nurse midwives" (for sentences) */
  targetTitle?: string;
  targetPlural?: string;
  /**
   * Education the move needs on O*NET's RL scale (5 associate, 6 bachelor's,
   * 8 master's…) when it is above the user's current job's — the move screen
   * then lists college programs (College Scorecard + IPEDS) at that level.
   */
  degreeLevel?: number;
  /**
   * No longer suggested (replaced by data-driven promotions and career changes,
   * 2026-10-20). Kept so plans that already include it still show it.
   */
  retired?: boolean;
  /**
   * How much the user has to put in (2026-10-21, Amit) — My plan is grouped
   * into these buckets, quick wins first:
   *   quick  – Quick wins: under ~20 hours of the user's own time, little or no
   *            cost, no change of job or home (a free wage claim, joining a
   *            union, OSHA 10). Waiting time (e.g. for a claim) doesn't count.
   *   effort – Worth the effort: weeks to about a year of training, real cost,
   *            or a lawyer (CDL, OSHA 30, a certificate program, LPN).
   *   big    – Big moves: a degree (associate and up) or moving to another city.
   * A label, not a number shown to the user. Data items (career moves,
   * credentials) get it from effortOf(); catalog items set it here.
   */
  effort?: Effort;
  /**
   * Rough hours of the user's own time — ONLY used to break ties when sorting
   * inside a bucket (equal value). Never shown on screen (no source).
   */
  effortHours?: number;
}

export type Effort = 'quick' | 'effort' | 'big';
/** Bucket order on screen — quick wins first */
export const EFFORT_ORDER: Effort[] = ['quick', 'effort', 'big'];

export type JobFamily =
  | 'Warehouse' | 'Gig' | 'Construction' | 'Manufacturing' | 'Retail' | 'Hospitality'
  | 'Care' | 'Cleaning' | 'Security' | 'Office';

/** Hands-on families — office moves (data entry etc.) are offered to these */
const PHYSICAL_FAMILIES: JobFamily[] = [
  'Warehouse', 'Gig', 'Construction', 'Manufacturing', 'Retail', 'Hospitality', 'Care', 'Cleaning', 'Security',
];

export const opportunityCatalog: Opportunity[] = [
  // Certification in the user's own job — pay difference from the Census
  // Current Population Survey (lib/certPay), programs from DOL ETA-9171
  {
    id: 'get-certified',
    effort: 'effort',
    effortHours: 150,
    title: 'Earn more with a certificate in your job',
    goalTitles: { rise_up: 'Stand out for promotion with a certificate in your job' },
    gain: 'Checking what certified workers in your job earn…',
    gainAmount: 0,               // computed per user — gainModel below
    gainModel: 'cert_gap',
    kind: 'add_on',
    countGroup: 'own-cert',      // same Census gap as the missing-credential items
    trainingSoc: 'current',
    note: 'The survey compares workers in the same job with and without a certification or license. It doesn\'t say which one they hold — ask employers in your area which credential they look for.',
    jobFamily: 'All',
    goalAlignment: ['earn_more', 'rise_up'],
    timeline: 'Depends on the program',
    physicalDemand: 'low',
    steps: [
      { title: 'Find out which credential counts', detail: 'Look at job ads for your job near you and note the certifications or licenses they ask for. CareerOneStop\'s Certification Finder lists them by occupation.' },
      { title: 'Compare approved programs', detail: 'The programs below are approved by your state and report their results to the U.S. Dept. of Labor.' },
      { title: 'Ask who can pay', detail: 'Your employer, or your local American Job Center (federal WIOA funds), may cover the cost.' },
      { title: 'Finish and pass the exam', detail: 'Keep the certificate and tell your manager — then ask for the pay rate certified workers get.' },
    ],
  },
  // Warehouse / Logistics
  {
    id: 'cdl-class-b',
    effort: 'effort',
    effortHours: 160,
    retired: true,
    trainingSoc: '53-3032',      // heavy and tractor-trailer truck drivers
    title: 'Qualify for driver jobs with a CDL',
    courseKeyword: 'CDL Class B license training',
    gain: 'Qualifies you for local delivery driver jobs',
    gainAmount: 0,
    note: 'A Class B CDL opens local delivery driver jobs',
    jobFamily: 'Warehouse',
    alsoFor: ['Gig', 'Manufacturing'],
    goalAlignment: ['earn_more', 'rise_up'],
    timeline: '4–8 weeks',
    physicalDemand: 'medium',
    steps: [
      { title: 'Get your CDL permit', detail: 'Pass the CDL knowledge test at your state DMV — study the CDL manual' },
      { title: 'Find a training program', detail: 'Many carriers (UPS, FedEx, Amazon) offer paid CDL training on the job' },
      { title: 'Pass your road skills test', detail: 'Schedule with your state DMV — CDL opens routes up to 26,000 lbs' },
    ],
  },
  {
    id: 'move-high-wage',
    effort: 'big',
    effortHours: 400,
    title: 'Relocate to a Higher-Wage Metro',
    gain: 'See where your job pays more — after cost of living',
    gainAmount: 0,               // computed per user — gainModel below
    gainModel: 'relocation',
    note: 'Same role, higher pay after living costs — compared using official wage and price data',
    jobFamily: 'Warehouse',
    alsoFor: ['*'],
    goalAlignment: ['earn_more', 'change_careers'],
    timeline: '1–3 months',
    physicalDemand: 'high',
    steps: [
      { title: 'Pick 2–3 target cities', detail: 'Use the list above — it compares pay after living costs, not just pay' },
      { title: 'Search for jobs there', detail: 'Open the job search for each city and apply before you move', action: 'relocation_jobs' },
      { title: 'Ask about relocation help', detail: 'Large employers (warehouses, hospitals, hotel chains) often offer sign-on or moving bonuses — ask in the interview' },
      { title: 'Budget the move', detail: 'Plan for a rent deposit, travel and about a month of expenses before the first paycheck' },
    ],
  },
  {
    id: 'federal-logistics',
    effort: 'effort',
    effortHours: 80,
    retired: true,
    title: 'Switch to USPS / Federal Logistics',
    gain: 'Federal pay scale + benefits',
    gainAmount: 0,
    note: 'Same skills, federal pay + pension',
    jobFamily: 'Warehouse',
    alsoFor: ['Gig', 'Manufacturing'],
    goalAlignment: ['earn_more', 'work_life_balance', 'claim_rights'],
    timeline: '2–5 months',
    physicalDemand: 'medium',
    steps: [
      { title: 'Search USAJOBS.gov', detail: 'Search "logistics" or "supply chain" on usajobs.gov for federal roles' },
      { title: 'Apply to USPS', detail: 'USPS.com/careers — Mail Handler and Distribution jobs open frequently' },
      { title: 'Understand federal pay scales', detail: 'Federal jobs are paid on the General Schedule (GS) and include health, pension and TSP' },
    ],
  },
  {
    id: 'osha-10-cert',
    effort: 'quick',
    effortHours: 10,
    title: 'Get OSHA 10 Certification',
    courseKeyword: 'OSHA 10-hour certification course',
    gain: 'A safety credential that helps with promotions',
    gainAmount: 0,
    note: 'Fast path to team lead and supervisory roles',
    jobFamily: 'Warehouse',
    alsoFor: ['Construction', 'Manufacturing', 'Cleaning'],
    goalAlignment: ['rise_up'],
    timeline: '10 hours (1–2 days)',
    physicalDemand: 'low',
    steps: [
      { title: 'Take the OSHA 10-Hour course', detail: 'Online via an OSHA-authorized training provider' },
      { title: 'Ask employer to reimburse', detail: 'Most safety-conscious employers cover OSHA training costs' },
      { title: 'Add it to your resume', detail: 'OSHA card is recognized nationwide and boosts promotion applications' },
    ],
  },

  // Construction
  {
    id: 'osha-30',
    effort: 'effort',
    effortHours: 30,
    title: 'Get OSHA 30 Certification',
    courseKeyword: 'OSHA 30-hour certification course',
    gain: 'Opens supervisor and foreman roles',
    gainAmount: 0,
    note: 'Required for supervisory and foreman roles',
    jobFamily: 'Construction',
    alsoFor: ['Manufacturing'],
    goalAlignment: ['rise_up', 'earn_more'],
    timeline: '30 hours (3–5 days)',
    physicalDemand: 'high',
    steps: [
      { title: 'Complete OSHA 30-Hour course', detail: 'Online or in-person with an OSHA-authorized provider; many contractors pay for this' },
      { title: 'Pair with a trade credential', detail: 'Combine with journeyman or master electrician/plumber license' },
      { title: 'Apply for foreman roles', detail: 'Many foreman job ads ask for OSHA 30 plus site experience' },
    ],
  },
  {
    id: 'construction-supervisor',
    effort: 'effort',
    effortHours: 300,
    retired: true,
    title: 'Site Foreman or Supervisor Role',
    gain: 'A step up to running a crew',
    gainAmount: 0,
    note: 'Less physical, more oversight',
    jobFamily: 'Construction',
    goalAlignment: ['rise_up', 'less_physical'],
    timeline: '1–2 years',
    physicalDemand: 'low',
    steps: [
      { title: 'Get OSHA 30 + First Aid/CPR', detail: 'Both are expected for supervisory roles on most job sites' },
      { title: 'Build team experience', detail: 'Volunteer to mentor new hires and coordinate small crews now' },
      { title: 'Apply internally first', detail: 'Most general contractors promote site supervisors from within their crew' },
    ],
  },

  // Retail
  {
    id: 'retail-team-lead',
    effort: 'effort',
    effortHours: 150,
    retired: true,
    title: 'Step Up to Retail Team Leader',
    gain: 'A step up with bonus eligibility',
    gainAmount: 0,
    note: 'Scheduling control + bonus eligibility',
    jobFamily: 'Retail',
    goalAlignment: ['rise_up', 'earn_more'],
    timeline: '6–12 months',
    physicalDemand: 'medium',
    steps: [
      { title: 'Complete a retail management cert', detail: 'NRF Retail Industry Fundamentals — free via National Retail Federation' },
      { title: 'Express interest to your manager', detail: 'Ask to cover team leader shifts during vacations or absences' },
      { title: 'Track your wins', detail: 'Document shrink reduction, upsell numbers, and attendance management' },
    ],
  },
  {
    id: 'retail-corporate',
    effort: 'effort',
    effortHours: 300,
    retired: true,
    title: 'Move into Retail Corporate Role',
    gain: 'An office career using your store experience',
    gainAmount: 0,
    note: 'Planning, buying, or ops analyst',
    jobFamily: 'Retail',
    goalAlignment: ['change_careers', 'less_physical'],
    timeline: '6–18 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Identify corporate roles', detail: 'Merchandise planner, replenishment analyst, store ops coordinator' },
      { title: 'Build Excel and data skills', detail: 'Free LinkedIn Learning or Google Data Analytics Certificate (Coursera)' },
      { title: 'Apply internally', detail: 'Target, Walmart, Home Depot and others post corporate roles internally first' },
    ],
  },

  // Hospitality
  {
    id: 'servsafe-manager',
    effort: 'quick',
    effortHours: 16,
    title: 'Get ServSafe Manager Certification',
    courseKeyword: 'ServSafe Manager certification course',
    gain: 'Qualifies you for kitchen and bar management',
    gainAmount: 0,
    note: 'Required for bar and kitchen management',
    jobFamily: 'Hospitality',
    goalAlignment: ['rise_up', 'earn_more'],
    timeline: '1–4 weeks',
    physicalDemand: 'medium',
    steps: [
      { title: 'Take the ServSafe Manager course', detail: 'Online or in-person via ServSafe (National Restaurant Association)' },
      { title: 'Pass the proctored exam', detail: 'ServSafe certification is required in most states for food service managers' },
      { title: 'Negotiate your new rate', detail: 'Use your new certification to ask for a manager rate' },
    ],
  },
  {
    id: 'events-coordinator',
    effort: 'effort',
    effortHours: 200,
    retired: true,
    title: 'Move into Events Coordination',
    courseKeyword: 'event planning coordinator certificate program',
    gain: 'A less physical role in hospitality',
    gainAmount: 0,
    note: 'Less physical than floor service',
    jobFamily: 'Hospitality',
    goalAlignment: ['change_careers', 'less_physical', 'work_life_balance'],
    timeline: '3–9 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Get a CMP or event planning cert', detail: 'Certified Meeting Professional (CMP) or free coursework via MPI Foundation' },
      { title: 'Volunteer at local events', detail: 'Build a portfolio — charity dinners, corporate events, weddings' },
      { title: 'Target hotel or venue chains', detail: 'Marriott, Hilton, Hyatt, and Compass Group hire internal candidates first' },
    ],
  },

  // Healthcare Support
  {
    id: 'cna-to-lpn',
    effort: 'effort',
    effortHours: 1200,
    retired: true,
    trainingSoc: '29-2061',      // licensed practical nurses
    title: 'Advance from CNA to LPN (Nursing)',
    courseKeyword: 'LPN Licensed Practical Nurse program',
    gain: 'A licensed nursing role',
    gainAmount: 0,
    note: 'CNA = Certified Nursing Assistant → LPN = Licensed Practical Nurse',
    jobFamily: 'Care',
    goalAlignment: ['rise_up', 'earn_more'],
    timeline: '12–18 months',
    physicalDemand: 'medium',
    steps: [
      { title: 'Enroll in an LPN program', detail: 'Community colleges and technical schools run LPN programs; many employers offer tuition aid' },
      { title: 'Complete clinical hours', detail: 'Supervised clinical hours are required — your state nursing board sets how many' },
      { title: 'Pass the NCLEX-PN', detail: 'National licensing exam — study with Uworld or ATI prep materials' },
    ],
  },
  {
    id: 'care-coordinator',
    effort: 'effort',
    effortHours: 400,
    retired: true,
    trainingSoc: '31-9092',      // medical assistants (CCMA)
    title: 'Move to Care Coordinator Role',
    courseKeyword: 'Certified Clinical Medical Assistant CCMA program',
    gain: 'An office-based healthcare role',
    gainAmount: 0,
    note: 'Office-based, less physical demand',
    jobFamily: 'Care',
    goalAlignment: ['less_physical', 'rise_up', 'change_careers'],
    timeline: '1–2 years',
    physicalDemand: 'low',
    steps: [
      { title: 'Get a Medical Administrative cert', detail: 'CCMA via NHA or a similar certifying body' },
      { title: 'Shadow your care coordinator', detail: 'Ask to sit in on scheduling and patient intake workflows' },
      { title: 'Apply at hospitals or home health agencies', detail: 'CommonSpirit, HCA, and local home health agencies hire regularly' },
    ],
  },

  // Gig Economy
  {
    id: 'multi-app',
    // General advice with nothing concrete behind it — not suggested any more (Amit, 2026-10-26); kept for plans that have it
    retired: true,
    effort: 'quick',
    effortHours: 5,
    title: 'Multi-App Gig Strategy',
    gain: 'Less waiting time between orders',
    gainAmount: 0,
    note: 'Reduce dead time between orders',
    jobFamily: 'Gig',
    goalAlignment: ['earn_more'],
    timeline: '1–2 weeks',
    physicalDemand: 'medium',
    steps: [
      { title: 'Sign up to a 2nd platform', detail: 'DoorDash + Uber Eats, or Instacart + Spark — run them simultaneously' },
      { title: 'Track your zone heat maps', detail: 'Gridwise app (free tier) shows busy zones and earnings by hour' },
      { title: 'Focus on high-value orders', detail: 'Prioritize short, high-tip orders during peak lunch and dinner hours' },
    ],
  },
  {
    id: 'ups-fedex-driver',
    effort: 'effort',
    effortHours: 80,
    retired: true,
    title: 'Transition to UPS / FedEx Driver',
    gain: 'Steady employee pay + benefits',
    gainAmount: 0,
    note: 'W-2 employee — stable income and benefits',
    jobFamily: 'Gig',
    alsoFor: ['Warehouse'],
    goalAlignment: ['change_careers', 'earn_more', 'claim_rights'],
    timeline: '2–4 months',
    physicalDemand: 'medium',
    steps: [
      { title: 'Check CDL requirements', detail: 'Class B CDL needed for larger routes — see the CDL suggestion' },
      { title: 'Apply directly to UPS or FedEx', detail: 'Both hire experienced delivery drivers — apply at ups.jobs and fedex.com/careers' },
      { title: 'Negotiate your package', detail: 'Ask about pay scale, overtime and benefits before you accept' },
    ],
  },

  // Office / Admin
  {
    id: 'data-entry-admin',
    effort: 'effort',
    effortHours: 100,
    retired: true,
    title: 'Move into Data Entry / Admin',
    courseKeyword: 'Microsoft Office Specialist MOS certification course',
    gain: 'Office work with no physical demands',
    gainAmount: 0,
    note: 'Office-based, no physical demands',
    jobFamily: 'Admin',
    alsoFor: PHYSICAL_FAMILIES,
    goalAlignment: ['less_physical', 'change_careers'],
    timeline: '1–3 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Get Microsoft Office certified', detail: 'Microsoft Office Specialist (MOS) exam via Certiport' },
      { title: 'Apply for data entry roles', detail: 'Target hospitals, logistics companies, and government contractors' },
      { title: 'Highlight your accuracy record', detail: 'Your pick-rate or inventory accuracy stats translate directly to this work' },
    ],
  },
  {
    id: 'supply-chain-analyst',
    effort: 'effort',
    effortHours: 500,
    retired: true,
    title: 'Become a Supply Chain Analyst',
    courseKeyword: 'APICS CSCP supply chain certification',
    gain: 'An office career using your floor knowledge',
    gainAmount: 0,
    note: 'Uses your warehouse floor knowledge',
    jobFamily: 'Admin',
    alsoFor: ['Warehouse', 'Gig', 'Manufacturing'],
    goalAlignment: ['change_careers', 'rise_up', 'less_physical'],
    timeline: '12–18 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Get APICS CSCP or CLTD cert', detail: 'Certified Supply Chain Professional (ASCM) — self-study plus exam' },
      { title: 'Build Excel and ERP skills', detail: 'SAP and Oracle basics on LinkedIn Learning; Google Data cert on Coursera' },
      { title: 'Target logistics company HQs', detail: 'Amazon, UPS, Ryder, and C.H. Robinson value floor-level operations experience' },
    ],
  },

  // Rights track
  {
    id: 'union-membership',
    effort: 'quick',
    effortHours: 3,
    title: 'Join a Labor Union',
    gain: 'Union members earn more than non-union workers (median)',
    gainAmount: 0,               // computed per user — gainModel below
    gainModel: 'union_premium',
    kind: 'add_on',
    note: 'Collective bargaining + legal protection',
    jobFamily: 'All',
    goalAlignment: ['claim_rights'],   // rights only — not suggested for "Earn more money"
    timeline: 'Immediate',
    physicalDemand: 'low',
    steps: [
      { title: 'Check if you\'re already covered', detail: 'Not sure if you\'re a member? Look for union dues on your pay stub, or ask co-workers or HR. If there\'s a contract, ask for the shop steward.' },
      { title: 'Contact the union for your work', detail: 'Use the links below to reach the union that represents your field. Dues vary by local — ask before you sign up.' },
      { title: 'No union yet? Organize', detail: 'With signed cards from at least 30% of co-workers, you can petition the NLRB for a union election. A union organizer can guide you through it.' },
    ],
  },
  {
    id: 'wage-theft-claim',
    effort: 'quick',
    effortHours: 6,
    title: 'Recover Unpaid Wages',
    kind: 'one_off',
    gain: 'Get back pay you are owed',
    gainAmount: 0,
    note: 'Free complaint with the Dept. of Labor or your state',
    jobFamily: 'All',
    goalAlignment: ['claim_rights'],
    timeline: '1–6 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Check your entitlement', detail: 'Use the check above — it applies your state\'s minimum wage and overtime rules to your hours.' },
      { title: 'File a wage complaint', detail: 'Free and confidential. File with the US Dept. of Labor or your state labor office — links below.', action: 'report_wage_claim' },
      { title: 'Consult a wage attorney', detail: 'Many employment lawyers handle wage cases on contingency — no upfront cost' },
    ],
  },
  {
    id: 'minimum-wage-check',
    effort: 'quick',
    effortHours: 3,
    title: 'Verify You\'re Paid Minimum Wage',
    gain: 'Check your pay against your state\'s minimum',
    gainAmount: 0,               // computed per user — gainModel below
    gainModel: 'min_wage_gap',
    kind: 'pay_fix',
    note: 'Deductions may push you below minimum',
    jobFamily: 'All',
    goalAlignment: ['claim_rights', 'earn_more'],
    timeline: '1–4 weeks',
    physicalDemand: 'low',
    steps: [
      { title: 'Run the check above', detail: 'Enter your pay and hours — we compare it with your state\'s current minimum, including overtime rules.' },
      { title: 'Keep records', detail: 'Save pay stubs and write down the hours you actually work each week. They are your evidence.' },
      { title: 'Report if underpaid', detail: 'Free and confidential — your employer can\'t legally retaliate. Back pay can usually be claimed for 2 years (3 if willful).', action: 'report_wage_claim' },
    ],
  },

  // Work-life balance track
  {
    id: 'flexible-schedule',
    // General advice with nothing concrete behind it — not suggested any more (Amit, 2026-10-26); kept for plans that have it
    retired: true,
    effort: 'quick',
    effortHours: 2,
    title: 'Request a Flexible Work Schedule',
    gain: '4-day week or flex hours',
    gainAmount: 0,
    note: 'Negotiate schedule without losing pay',
    jobFamily: 'All',
    goalAlignment: ['work_life_balance'],
    timeline: '1–3 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Make your case to your manager', detail: 'No federal right to flex, but many employers agree when you show operational benefit' },
      { title: 'Frame it around productivity', detail: '4×10 shifts reduce handover time and can cut overtime costs for the employer' },
      { title: 'Put it in writing', detail: 'Get any schedule agreement confirmed via email so it\'s documented' },
    ],
  },
  {
    id: 'school-hours-role',
    // General advice with nothing concrete behind it — not suggested any more (Amit, 2026-10-26); kept for plans that have it
    retired: true,
    effort: 'effort',
    effortHours: 40,
    title: 'Switch to School-Hours Schedule',
    gain: 'Can cut your childcare costs',
    gainAmount: 0,
    note: 'Morning or 9–3 shift patterns',
    jobFamily: 'All',
    goalAlignment: ['work_life_balance'],
    timeline: '1–4 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Identify school-hours roles', detail: 'School nutrition staff, healthcare admin, and local government often hire 8–3 shifts' },
      { title: 'Calculate the net benefit', detail: 'Even a slightly lower wage may net more after childcare savings' },
      { title: 'Apply with your availability clearly stated', detail: '"Available 8am–3pm weekdays" filters you into the right listings on Indeed' },
    ],
  },
  {
    id: 'remote-quality-inspection',
    effort: 'effort',
    effortHours: 200,
    retired: true,
    title: 'Move into Remote Quality Inspection',
    courseKeyword: 'ASQ Certified Quality Technician CQT exam prep',
    gain: 'Less physical, possibly remote',
    gainAmount: 0,
    note: 'Video-based inspection, no commute',
    jobFamily: 'All',
    goalAlignment: ['less_physical', 'work_life_balance', 'change_careers'],
    timeline: '3–9 months',
    physicalDemand: 'low',
    steps: [
      { title: 'Get ASQ Quality Technician cert', detail: 'American Society for Quality CQT exam — study materials at asq.org' },
      { title: 'Target manufacturing QA roles', detail: 'Look for QA inspector roles in automotive and electronics plants' },
      { title: 'Highlight your floor experience', detail: 'QA inspectors who\'ve worked the production process are preferred candidates' },
    ],
  },
];

/** Catalog job family for a free-text role (undefined = show general opportunities) */
/**
 * Job family for the opportunity list, from the matched BLS occupation (SOC
 * code) first, then from words in the job title the user typed.
 */
export function jobFamilyFor(soc?: string | null, role?: string | null): JobFamily | undefined {
  if (soc) {
    const major = soc.slice(0, 2);
    const minor = soc.slice(0, 4);           // e.g. '53-3'
    if (major === '53') return minor === '53-3' ? 'Gig' : 'Warehouse';
    if (major === '47' || major === '49') return 'Construction';
    if (major === '51') return 'Manufacturing';
    if (major === '41') return 'Retail';
    if (major === '35') return 'Hospitality';
    if (major === '31' || soc.startsWith('29-2') || soc.startsWith('39-9')) return 'Care';
    if (major === '37') return 'Cleaning';
    if (major === '33') return 'Security';
    if (major === '43') return 'Office';
  }
  const r = ` ${(role ?? '').toLowerCase()} `;
  const has = (words: string[]) => words.some((w) => new RegExp(`\\b${w}`).test(r));
  if (has(['warehouse', 'picker', 'packer', 'forklift', 'stocker', 'loader', 'material handler', 'fulfil'])) return 'Warehouse';
  if (has(['driver', 'delivery', 'courier', 'uber', 'lyft', 'doordash', 'instacart', 'gig'])) return 'Gig';
  if (has(['construction', 'carpent', 'laborer', 'labourer', 'electrician', 'plumb', 'roofer', 'mason', 'hvac', 'painter', 'welder'])) return 'Construction';
  if (has(['factory', 'assembl', 'production', 'machin', 'manufactur'])) return 'Manufacturing';
  if (has(['retail', 'cashier', 'store', 'sales associate', 'shop'])) return 'Retail';
  if (has(['cook', 'chef', 'server', 'waiter', 'waitress', 'bartender', 'barista', 'hotel', 'restaurant', 'kitchen', 'dishwasher', 'hospitality', 'housekeep'])) return 'Hospitality';
  if (has(['care', 'cna', 'nurse', 'aide', 'nanny', 'childcare', 'caregiver'])) return 'Care';
  if (has(['clean', 'janitor', 'custodian'])) return 'Cleaning';
  if (has(['security', 'guard'])) return 'Security';
  if (has(['office', 'admin', 'receptionist', 'clerk'])) return 'Office';
  return undefined;
}

/** Does this opportunity fit the user's job family? Unknown family → only general ones. */
export function fitsFamily(o: Opportunity, family?: string): boolean {
  if (o.jobFamily === 'All' || o.alsoFor?.includes('*')) return true;
  if (!family) return false;
  return o.jobFamily === family || !!o.alsoFor?.includes(family);
}

export function getOpportunitiesForGoal(
  goal: Goal,
  jobFamily?: string,
  /** Personalised gain for opportunities with a gainModel (used for ranking) */
  gainOf: (o: Opportunity) => number = (o) => o.gainAmount,
  /** Items not to suggest for this user (e.g. the generic certificate when the job has mandatory credentials) */
  exclude: (o: Opportunity) => boolean = () => false,
): Opportunity[] {
  let results = opportunityCatalog.filter((o) => !o.retired && o.goalAlignment.includes(goal) && !exclude(o));
  results = results.filter((o) => fitsFamily(o, jobFamily));
  return certificationsFirst(results.sort((a, b) => gainOf(b) - gainOf(a))).slice(0, 4);
}

/**
 * The title for an item shown under a goal. Pass the goal it is shown under,
 * or the user's goals (most important first) when it isn't shown under one —
 * then the first goal the item helps with decides the wording.
 */
export function titleForGoal(o: Opportunity, goals: Goal | Goal[] | null | undefined): string {
  const list = goals == null ? [] : Array.isArray(goals) ? goals : [goals];
  const goal = list.find((g) => o.goalAlignment.includes(g));
  return (goal && o.goalTitles?.[goal]) || o.title;
}

const CERTIFICATION_IDS = ['get-certified', 'cdl-class-b', 'osha-10-cert', 'osha-30', 'servsafe-manager'];

/** A certification or licence (including the ones for the user's next role) */
export function isCertification(o: Opportunity): boolean {
  return o.id.startsWith('cert:') || o.id.startsWith('cred:') || CERTIFICATION_IDS.includes(o.id);
}

/**
 * Keep the gain order, but never suggest relocating before a certification:
 * relocation items move to just after the last certification.
 */
export function certificationsFirst<T extends Opportunity>(list: T[]): T[] {
  const lastCert = list.map(isCertification).lastIndexOf(true);
  if (lastCert < 0) return list;
  const isMove = (o: T, i: number) => o.gainModel === 'relocation' && i < lastCert;
  const moves = list.filter(isMove);
  if (!moves.length) return list;
  const rest = list.filter((o, i) => !isMove(o, i));
  const at = rest.map(isCertification).lastIndexOf(true) + 1;
  return [...rest.slice(0, at), ...moves, ...rest.slice(at)];
}

/** Effort bucket of an item (see Opportunity.effort). Unlabelled items count as "Worth the effort". */
export function effortOf(o: Opportunity): Effort {
  if (o.effort) return o.effort;
  if (o.gainModel === 'relocation' || (o.degreeLevel ?? 0) >= 5) return 'big';
  return 'effort';
}

/** Tie-breaker only (never shown): rough hours of the user's time */
export const effortHoursOf = (o: Opportunity) => o.effortHours ?? 100;
