/**
 * Reads AHRQ MEPS-IC state table series 10 ("Premium distributions … by State",
 * private sector) — the PDF ic<yy>_xc_e.pdf — into rows for meps_ic_premiums.
 * Used by scripts/import-meps-premiums.mjs; tested by scripts/meps/test.mjs.
 *
 * Tables used (their "Standard errors" twins are skipped):
 *   X.C single · X.D family · X.E employee-plus-one
 *   no suffix = total premium, .1 = employee contribution, .2 = employer cost
 * Each table: a "United States" line, then one line per state under division
 * headings ("New England:"): name, average, 10th, 25th, 50th, 75th, 90th
 * percentile. AHRQ marks figures below its reliability standard with "*".
 */

export const STATE_ABBR = {
  'United States': 'US',
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};
// Longest names first, so "West Virginia" is not read as "Virginia"
const NAMES = Object.keys(STATE_ABBR).sort((a, b) => b.length - a.length);

const COVERAGE = { C: 'single', D: 'family', E: 'plus_one' };
const PART = { '': 'premium', '.1': 'employee', '.2': 'employer' };

/** "Table X.C.1 Employee contribution…" → { coverage: 'single', part: 'employee' }; standard-error tables → 'skip' */
export function tableOf(line) {
  const m = line.match(/^\s*Table\s+X\.([A-Z])(\.\d)?\b\s*(.*)$/);
  if (!m) return null;
  if (/^Standard errors/i.test(m[3]) || !COVERAGE[m[1]]) return 'skip';
  const part = PART[m[2] ?? ''];
  if (!part) return 'skip';
  return { coverage: COVERAGE[m[1]], part };
}

/** "Alabama 2,048 650 * 990 1,600 2,800 3,500" → { abbr: 'AL', values: [2048, 650, …], flags: [false, true, …] } */
export function dataLine(line) {
  const s = line.replace(/\s+/g, ' ').trim();
  const name = NAMES.find((n) => s === n || s.startsWith(`${n} `));
  if (!name) return null;
  const rest = s.slice(name.length).trim();
  if (!rest || /^[A-Za-z]/.test(rest)) return null;          // a heading that starts with a state name
  const values = [], flags = [];
  for (const tok of rest.match(/\*|[-–]+|[\d,]+(?:\.\d+)?\*?/g) ?? []) {
    if (tok === '*') { if (flags.length) flags[flags.length - 1] = true; continue; }
    if (/^[-–]+$/.test(tok)) { values.push(null); flags.push(true); continue; }   // suppressed
    const star = tok.endsWith('*');
    values.push(Number(tok.replace(/[,*]/g, '')));
    flags.push(star);
  }
  if (values.length !== 6) return null;
  return { abbr: STATE_ABBR[name], values, flags };
}

/**
 * Lines of the whole PDF (top to bottom, page by page) → tables:
 * { single: { premium: {US: {values, flags}, AL: …}, employee: …, employer: … }, family: …, plus_one: … }
 */
export function parseTables(lines) {
  const out = {};
  let cur = null;
  for (const line of lines) {
    const tb = tableOf(line);
    if (tb) { cur = tb === 'skip' ? null : tb; continue; }
    if (!cur) continue;
    const d = dataLine(line);
    if (!d) continue;
    const table = ((out[cur.coverage] ??= {})[cur.part] ??= {});
    if (!table[d.abbr]) table[d.abbr] = { values: d.values, flags: d.flags };   // first one wins (no repeats)
  }
  return out;
}

/** Rows for meps_ic_premiums, plus problems found. Every table must have all 52 lines. */
export function toRows(tables, year) {
  const problems = [];
  const rows = [];
  const abbrs = Object.values(STATE_ABBR);
  let mismatches = 0;
  for (const coverage of ['single', 'plus_one', 'family']) {
    const t = tables[coverage] ?? {};
    for (const part of ['premium', 'employee', 'employer']) {
      const have = Object.keys(t[part] ?? {}).length;
      if (have !== abbrs.length) problems.push(`${coverage} ${part}: ${have} of ${abbrs.length} lines found`);
    }
    for (const st of abbrs) {
      const p = t.premium?.[st], e = t.employee?.[st], r = t.employer?.[st];
      if (!p || !e || !r) continue;
      const [prem] = p.values, [emp] = e.values, [er] = r.values;
      // The three averages are over the same people: premium = employee + employer (±rounding)
      if (prem != null && emp != null && er != null && Math.abs(prem - emp - er) > 3) {
        mismatches++;
        problems.push(`${coverage} ${st}: premium ${prem} ≠ employee ${emp} + employer ${er}`);
      }
      rows.push({
        year, state: st, coverage,
        premium: prem, employee: emp, employer: er,
        employee_p10: e.values[1], employee_p25: e.values[2], employee_p50: e.values[3],
        employee_p75: e.values[4], employee_p90: e.values[5],
        employer_reliable: !r.flags[0] && er != null,
      });
    }
  }
  return { rows, problems, mismatches };
}
