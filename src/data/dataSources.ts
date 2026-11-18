/**
 * Every outside source the app's numbers and facts come from, shown on the
 * "Data sources" screen (Fix My Job menu → Data sources).
 *
 * Sources are named at agency level, with a link to the agency (or division)
 * page — not the exact data set, table or file. That satisfies Google Play's
 * "link to the official source" rule without spelling out our methods.
 * Figures we calculate ourselves are labelled "Fix My Job estimate" on screen
 * (see data/sourceLabels.ts). Rights information keeps its specific legal
 * source: that is what users need to act on.
 *
 * Google Play (Misleading Claims policy): the store description must list
 * exactly the sources below — keep the two in step (claude/play-description.md).
 *
 * `credit` is attribution wording a source's licence or terms of use require —
 * keep it word for word. When a new source is added anywhere in the app, add
 * it here too.
 */

export interface DataSource {
  name: string;
  publisher: string;
  usedFor: string;
  /** Omitted when there is no single page to link to (row is not tappable) */
  url?: string;
  /** Required attribution / disclaimer text, verbatim */
  credit?: string;
}

export interface DataSourceGroup {
  title: string;
  sources: DataSource[];
}

/** Shown at the top of the Data sources screen (Google Play Misleading Claims policy). */
export const INDEPENDENCE_NOTE =
  'Fix My Job is an independent app. It is not affiliated with, endorsed by or acting for any government agency. Figures we calculate from public data are marked as Fix My Job estimates.';

export const DATA_SOURCE_GROUPS: DataSourceGroup[] = [
  {
    title: 'Pay and jobs',
    sources: [
      {
        name: 'US Bureau of Labor Statistics',
        publisher: 'U.S. Department of Labor',
        usedFor: 'What people in your job earn in the US and in your state, and how union pay compares.',
        url: 'https://www.bls.gov/',
      },
      {
        name: 'US Census Bureau',
        publisher: 'U.S. Department of Commerce',
        usedFor: 'Pay of workers with and without a certification or license, how many people in your job get health insurance through a job, earnings after training, and finding your nearest city from your ZIP code.',
        url: 'https://www.census.gov/',
        credit: 'This product uses the Census Bureau Data API but is not endorsed or certified by the Census Bureau.',
      },
      {
        name: 'O*NET',
        publisher: 'U.S. Department of Labor, Employment and Training Administration',
        usedFor: 'Matching your job title to an occupation, the work experience needed for the next role, related jobs and the skills they need.',
        url: 'https://www.onetcenter.org/',
        credit:
          'This app incorporates information from the O*NET Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. USDOL/ETA has not approved, endorsed, or tested these modifications. O*NET® is a trademark of USDOL/ETA.',
      },
      {
        name: 'Agency for Healthcare Research and Quality',
        publisher: 'U.S. Department of Health and Human Services',
        usedFor: 'What health insurance through a job costs in your state, and how much employers usually pay toward it.',
        url: 'https://meps.ahrq.gov/',
      },
      {
        name: 'US Bureau of Economic Analysis',
        publisher: 'U.S. Department of Commerce',
        usedFor: 'Cost of living when comparing pay between places.',
        url: 'https://www.bea.gov/',
      },
    ],
  },
  {
    title: 'Training and courses',
    sources: [
      {
        name: 'Employment and Training Administration',
        publisher: 'U.S. Department of Labor',
        usedFor: 'Approved training programs near you, how long they take and their results.',
        url: 'https://www.dol.gov/agencies/eta',
      },
      {
        name: 'Credential Engine',
        publisher: 'Credential Registry, a nonprofit public registry of credentials',
        usedFor: 'More courses near you, their cost, length and format, and the licenses and certifications they prepare for — as published by the schools, training providers and state agencies.',
        url: 'https://credentialfinder.org/',
      },
      {
        name: 'US Department of Education',
        publisher: 'College Scorecard and federal college data',
        usedFor: 'College programs that lead to a job: which colleges offer them, tuition, and earnings after graduating.',
        url: 'https://collegescorecard.ed.gov/',
      },
      {
        name: 'American Job Centers',
        publisher: 'CareerOneStop, sponsored by the U.S. Department of Labor',
        usedFor: 'Free job and training help near you.',
        url: 'https://www.careeronestop.org/LocalHelp/AmericanJobCenters/find-american-job-centers.aspx',
      },
      {
        name: 'Licenses and certificates a job requires',
        publisher: 'Federal rules (FMCSA, CMS, EPA, OSHA) and state licensing boards, listed by CareerOneStop (U.S. Department of Labor)',
        usedFor: 'Which licenses or certificates you need for a job in your state.',
        url: 'https://www.careeronestop.org/Toolkit/Training/find-licenses.aspx',
      },
    ],
  },
  {
    title: 'Your rights at work',
    sources: [
      {
        name: 'State minimum wage and overtime laws',
        publisher: 'U.S. Department of Labor, Wage and Hour Division',
        usedFor: 'The minimum wage check, tipped-pay rules, and daily, 7th-day and Sunday overtime in your state.',
        url: 'https://www.dol.gov/agencies/whd/minimum-wage/state',
      },
      {
        name: 'State labor offices',
        publisher: 'U.S. Department of Labor, Wage and Hour Division',
        usedFor: 'Where to report unpaid or under-minimum wages.',
        url: 'https://www.dol.gov/agencies/whd/state/contacts',
      },
      {
        name: 'State Plans',
        publisher: 'U.S. Occupational Safety and Health Administration (OSHA)',
        usedFor: 'Whether your state runs its own workplace-safety program.',
        url: 'https://www.osha.gov/stateplans',
      },
      {
        name: 'Federal labor laws (FLSA, OSHA, FMLA, NLRA, ADA, ADEA, Title VII)',
        publisher: 'U.S. Department of Labor, U.S. EEOC and National Labor Relations Board',
        usedFor: 'Your basic rights at work and complaint deadlines.',
        url: 'https://www.dol.gov/general/aboutdol/majorlaws',
      },
      {
        name: 'Paid sick leave',
        publisher: 'State labor departments, and the U.S. Department of Labor, Women’s Bureau',
        usedFor: 'Paid sick leave rules in your state.',
        url: 'https://www.dol.gov/agencies/wb',
      },
      {
        name: 'Local minimum wages',
        publisher: 'City and county governments and state labor departments',
        usedFor: 'Places with a higher local minimum wage than their state.',
        url: 'https://www.dol.gov/agencies/whd/state/contacts',
      },
      {
        name: 'State meal-break, rest-break and reporting-time pay rules',
        publisher: 'State labor laws (e.g. California Labor Code § 512 and § 226.7), as listed by the U.S. Department of Labor, Wage and Hour Division',
        usedFor: 'Whether your state requires breaks or pay when you’re sent home early, and California’s missed-break pay.',
        url: 'https://www.dol.gov/agencies/whd/state/meal-breaks',
      },
      {
        name: 'Overtime exemption salary level and payroll tax rates',
        publisher: 'U.S. Department of Labor (FLSA) and Internal Revenue Service',
        usedFor: 'When salaried workers are owed overtime, and the employer share of Social Security and Medicare (7.65%) in the contractor check.',
        url: 'https://www.irs.gov/taxtopics/tc751',
      },
    ],
  },
  {
    title: 'Other sources (not government)',
    sources: [
      {
        name: 'Online courses',
        publisher: 'Each training provider’s own website, found by web search with help from AI',
        usedFor: 'Course details and prices. Every course links to the provider’s page it came from.',
      },
      {
        name: 'Union directory',
        publisher: 'National union websites and the AFL-CIO',
        usedFor: 'Which unions represent your line of work.',
        url: 'https://aflcio.org/formaunion',
      },
    ],
  },
];

/** How AI is used — shown under the list so users know where numbers don't come from. */
export const AI_NOTE =
  'Suggestions (like a next job to aim for) are written with the help of AI. Every number in the app comes from one of the sources above — never from AI.';
