import { t } from '../i18n';
/** "7 years", "1 year" (in the current language) */
export function formatYears(y: number): string {
  return y === 1 ? t('1 year') : t('{n} years', { n: y });
}

/** "2 years 3 months", "8 months", "7 years" */
export function formatMonths(months: number): string {
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  const yy = y ? formatYears(y) : '';
  const mm = m ? (m === 1 ? t('1 month') : t('{n} months', { n: m })) : '';
  return [yy, mm].filter(Boolean).join(' ') || t('Less than a month');
}

/** Time in current job for display, from exact months when known. */
export function formatTenure(p: { tenureMonths?: number | null; yearsExperience?: number | null }): string | null {
  if (p.tenureMonths != null) return formatMonths(p.tenureMonths);
  if (p.yearsExperience == null) return null;
  if (p.yearsExperience > 10) return t('More than 10 years');
  return formatYears(p.yearsExperience);
}

/** Years in current job as a number (fractional when months are known). */
export const tenureYears = (p: { tenureMonths?: number | null; yearsExperience?: number | null }) =>
  p.tenureMonths != null ? p.tenureMonths / 12 : p.yearsExperience ?? 0;

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Everyday names for common official (BLS) job titles */
const SHORT_JOB: Record<string, string> = {
  'heavy and tractor-trailer truck drivers': 'truck drivers',
  'driver/sales workers and truck drivers': 'truck drivers',
  'light truck drivers': 'delivery truck drivers',
  'licensed practical and licensed vocational nurses': 'practical nurses',
  'home health and personal care aides': 'home care aides',
  'laborers and freight, stock, and material movers, hand': 'warehouse workers',
  'stockers and order fillers': 'stockers',
  'janitors and cleaners, except maids and housekeeping cleaners': 'janitors',
  'maids and housekeeping cleaners': 'housekeepers',
  'heating, air conditioning, and refrigeration mechanics and installers': 'HVAC technicians',
  'automotive service technicians and mechanics': 'auto mechanics',
  'plumbers, pipefitters, and steamfitters': 'plumbers',
  'welders, cutters, solderers, and brazers': 'welders',
  'security guards': 'security guards',
  'fast food and counter workers': 'fast food workers',
  'waiters and waitresses': 'servers',
  'industrial truck and tractor operators': 'forklift operators',
};

/**
 * A colloquial job name from an official title, for sentences:
 * "Kindergarten Teachers, Except Special Education" → "kindergarten teachers",
 * "First-Line Supervisors of Retail Sales Workers" → "retail sales supervisors".
 */
export function shortJobName(title: string): string {
  const en = shortJobNameEnglish(title);
  return translatedJob(en) ?? en;
}

/** shortJobName, always in English */
export function shortJobNameEnglish(title: string): string {
  const t = title.trim();
  const known = SHORT_JOB[t.toLowerCase()];
  if (known) return known;
  let s = t.replace(/\s*\([^)]*\)/g, '').split(',')[0].trim();          // drop ", Except …", ", All Other", lists
  // "Laborers and Freight" → "Laborers" (a plural noun before "and" stands on its own)
  const firstOf = (x: string) => {
    const and = x.split(/ and /i);
    return and.length > 1 && /s$/i.test(and[0].trim()) && and[0].trim().split(' ').length <= 3 ? and[0].trim() : x;
  };
  const sup = s.match(/^First-Line Supervisors of (.+?)( Workers)?$/i);
  s = sup ? `${firstOf(sup[1])} supervisors` : firstOf(s);
  return s.replace(/\b([A-Z])([a-z])/g, (_m, a, b) => a.toLowerCase() + b).replace(/\bhvac\b/i, 'HVAC');
}

/** One person's job name for "Move up to …" ("nurse midwives" → "nurse midwife"); English only */
export function singularJobName(title: string): string {
  const plural = shortJobNameEnglish(title);
  if (translatedJob(plural)) return shortJobName(title);          // Spanish: keep the dictionary's plural
  return plural.replace(/(\w+)$/, (w) =>
    /wives$/i.test(w) ? w.replace(/wives$/i, 'wife')
    : /men$/i.test(w) ? w.replace(/men$/i, 'man')
    : /ies$/i.test(w) ? w.replace(/ies$/i, 'y')
    : /(ss|sh|ch|x)es$/i.test(w) ? w.slice(0, -2)
    : /[^s]s$/i.test(w) ? w.slice(0, -1)
    : w);
}

/** A saved location label for display ("City in Texas" → "Ciudad en Texas") */
export function placeName(label: string | null | undefined): string {
  if (!label) return t('the US');
  const rural = label.match(/^Rural \/ suburban (.+)$/);
  if (rural) return t('Rural / suburban {state}', { state: rural[1] });
  const city = label.match(/^City in (.+)$/);
  if (city) return t('City in {state}', { state: city[1] });
  return label;
}

/** The same place inside a sentence ("… in a city in Texas") */
export function placeInSentence(label: string | null | undefined): string {
  if (!label) return t('the US');
  const rural = label.match(/^Rural \/ suburban (.+)$/);
  if (rural) return t('rural / suburban {state}', { state: rural[1] });
  const city = label.match(/^City in (.+)$/);
  if (city) return t('a city in {state}', { state: city[1] });
  return label;
}

/** Job name in Spanish when we have one ("forklift operators" → "operadores de montacargas") */
export function translatedJob(englishPlural: string): string | null {
  const out = t(englishPlural);
  return out !== englishPlural ? out : null;
}
