/**
 * Freshness check for the college-program list (degree_programs).
 *
 * degree_programs is loaded by scripts/import-degree-programs.mjs, run by hand
 * on the PC (the source files are too big for an Edge Function). This check
 * runs weekly inside refresh-benchmarks ('all' runs, or {"job":"degreecheck"})
 * and writes "OUT OF DATE: …" to benchmark_refresh_log.detail when IPEDS or
 * College Scorecard has published newer data than what was imported.
 *
 * Pure helpers here (unit-tested); the fetching is in index.ts.
 */

/** What the import stored in degree_programs.data_year, e.g. 'IPEDS 2024 · Scorecard 2026-10' */
export function parseDataYear(dataYear: string | null | undefined): { ipeds: number | null; scorecard: string | null } {
  const s = dataYear ?? '';
  const ipeds = s.match(/IPEDS (\d{4})/);
  const sc = s.match(/Scorecard (\d{4}-\d{2})/);
  return { ipeds: ipeds ? Number(ipeds[1]) : null, scorecard: sc ? sc[1] : null };
}

/** Release of the current Scorecard field-of-study file from the data page, as 'YYYY-MM' */
export function scorecardRelease(page: string): string | null {
  const m = page.match(/Most-Recent-Cohorts-Field-of-Study_(\d{2})(\d{2})(\d{4})\.zip/);
  return m ? `${m[3]}-${m[1]}` : null;
}

export const DEGREE_IMPORT_HINT = 'run scripts/import-degree-programs.mjs on the PC (see claude/degree-programs.md)';

/**
 * Compare what we have with what is published.
 * latestIpeds: newest IPEDS completions year found (null = none found / not checked).
 * latestScorecard: 'YYYY-MM' of the current Scorecard file (null = link not found).
 */
export function compareDegreeData(have: string | null | undefined, latestIpeds: number | null, latestScorecard: string | null) {
  if (!have) return { outOfDate: true, detail: `OUT OF DATE: degree_programs is empty — ${DEGREE_IMPORT_HINT}` };
  const h = parseDataYear(have);
  const newer: string[] = [];
  if (latestIpeds != null && (h.ipeds == null || latestIpeds > h.ipeds)) {
    newer.push(`IPEDS ${latestIpeds} is out (have ${h.ipeds ?? 'unknown'})`);
  }
  if (latestScorecard != null && (h.scorecard == null || latestScorecard > h.scorecard)) {
    newer.push(`College Scorecard ${latestScorecard} is out (have ${h.scorecard ?? 'unknown'})`);
  }
  const notes: string[] = [];
  if (latestIpeds == null) notes.push('could not check IPEDS');
  if (latestScorecard == null) notes.push('Scorecard download link not found');
  const tail = notes.length ? ` (${notes.join('; ')})` : '';
  return newer.length
    ? { outOfDate: true, detail: `OUT OF DATE: ${newer.join('; ')} — ${DEGREE_IMPORT_HINT}${tail}` }
    : { outOfDate: false, detail: `up to date: ${have}${tail}` };
}
