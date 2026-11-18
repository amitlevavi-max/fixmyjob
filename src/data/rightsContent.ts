/**
 * US Federal Labor Rights Content
 *
 * Sources: FLSA, OSHA, FMLA, NLRA, ADA, ADEA, Title VII
 * Note: State laws often exceed federal minimums — show state-specific
 * details via the AI question feature.
 */

export interface RightsCategory {
  id: string;
  icon: string;
  /** Line-icon name used by the UI (MaterialCommunityIcons) */
  lineIcon: string;
  label: string;
  facts: Array<{ key: string; value: string }>;
  legislation: string;
  helpLink?: string;
}

export const rightsCategories: RightsCategory[] = [
  {
    id: 'wages_hours',
    icon: '💵',
    lineIcon: 'cash',
    label: 'Wages & Hours',
    facts: [
      { key: 'Federal minimum wage', value: '$7.25/hr (many states higher)' },
      { key: 'Overtime threshold', value: '1.5× pay after 40 hrs/week' },
      { key: 'Overtime eligibility', value: 'Most hourly workers qualify' },
      { key: 'Paycheck timing', value: 'Set by state law (typically bi-weekly)' },
      { key: 'Pay stub requirement', value: 'Required in most states' },
      { key: 'Tip credit', value: '$2.13/hr if tips bring you to min. wage' },
      { key: 'Deductions from pay', value: 'Cannot reduce you below min. wage' },
    ],
    legislation: 'Fair Labor Standards Act (FLSA) · State Minimum Wage Laws',
    helpLink: 'https://www.dol.gov/agencies/whd/minimum-wage',
  },
  {
    id: 'safety',
    icon: '🦺',
    lineIcon: 'hard-hat',
    label: 'Workplace Safety',
    facts: [
      { key: 'Safe workplace right', value: 'Employer must provide safe conditions' },
      { key: 'PPE requirement', value: 'Employer must provide at no cost' },
      { key: 'Refuse dangerous work', value: 'Protected right — no retaliation' },
      { key: 'Report injuries', value: 'Must be recorded by employer (300 log)' },
      { key: 'OSHA inspection right', value: 'Request confidential inspection' },
      { key: 'Retaliation protection', value: 'Cannot be fired for reporting hazards' },
      { key: 'Training right', value: 'Must be trained in language you understand' },
    ],
    legislation: 'Occupational Safety & Health Act (OSHA) 1970',
    helpLink: 'https://www.osha.gov/workers',
  },
  {
    id: 'leave_benefits',
    icon: '🏥',
    lineIcon: 'hospital-box-outline',
    label: 'Leave & Benefits',
    facts: [
      { key: 'Family & medical leave', value: '12 weeks unpaid (FMLA — 50+ employee cos.)' },
      { key: 'FMLA eligibility', value: '12 months at job, 1,250 hrs worked' },
      { key: 'Jury duty leave', value: 'Protected in all states' },
      { key: 'Military leave', value: 'Job protected under USERRA' },
      { key: 'Sick leave (federal)', value: 'No federal mandate — check your state' },
      { key: 'Health insurance (ACA)', value: 'Required for employers 50+ FTE' },
      { key: '401(k)', value: 'Employer match vesting schedule in plan docs' },
    ],
    legislation: 'FMLA 1993 · ACA · USERRA · State Paid Leave Laws',
  },
  {
    id: 'discrimination',
    icon: '⚖️',
    lineIcon: 'scale-balance',
    label: 'Anti-Discrimination',
    facts: [
      { key: 'Protected classes', value: 'Race, sex, age (40+), disability, religion, national origin' },
      { key: 'Sexual harassment', value: 'Illegal — employer must act on complaints' },
      { key: 'Equal pay', value: 'Same pay for same work regardless of sex' },
      { key: 'Retaliation ban', value: 'Cannot punish you for filing a complaint' },
      { key: 'Reasonable accommodation', value: 'Required for disability & religion' },
      { key: 'File EEOC charge', value: 'Within 180 days of discrimination (300 in some states)' },
      { key: 'Pregnancy protection', value: 'Cannot be fired or demoted for pregnancy' },
    ],
    legislation: 'Title VII · ADA · ADEA · Equal Pay Act · PWFA 2023',
    helpLink: 'https://www.eeoc.gov/filing-charge-discrimination',
  },
  {
    id: 'termination',
    icon: '📋',
    lineIcon: 'clipboard-text-outline',
    label: 'Termination & At-Will',
    facts: [
      { key: 'At-will employment', value: 'Most states — employer can fire for any legal reason' },
      { key: 'Illegal termination', value: 'Cannot fire for protected class or retaliation' },
      { key: 'WARN Act', value: '60-day notice for mass layoffs (100+ employees)' },
      { key: 'Final paycheck', value: 'Required within days — varies by state' },
      { key: 'Unemployment benefits', value: 'Available if laid off (not fired for cause)' },
      { key: 'Severance', value: 'Not required by law — check your contract' },
      { key: 'Non-compete enforceability', value: 'Varies widely by state' },
    ],
    legislation: 'WARN Act · State Termination Laws · NLRA',
    helpLink: 'https://www.dol.gov/general/topic/termination',
  },
  {
    id: 'unions',
    icon: '🤝',
    lineIcon: 'handshake-outline',
    label: 'Unions & Organizing',
    facts: [
      { key: 'Right to organize', value: 'Protected under NLRA for most workers' },
      { key: 'Union activity protection', value: 'Cannot be fired for organizing' },
      { key: 'Collective bargaining', value: 'Employer must negotiate in good faith' },
      { key: 'Concerted activity', value: 'Group complaints about pay/conditions protected' },
      { key: 'Right to representation', value: 'Union rep at disciplinary meetings (Weingarten)' },
      { key: 'File NLRB charge', value: 'For unfair labor practices' },
      { key: 'Gig workers', value: 'NLRA coverage varies — check your classification' },
    ],
    legislation: 'National Labor Relations Act (NLRA) 1935',
    helpLink: 'https://www.nlrb.gov/rights-we-protect/rights/employee-rights',
  },
];
