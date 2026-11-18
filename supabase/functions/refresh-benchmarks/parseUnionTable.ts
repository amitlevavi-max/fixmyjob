/**
 * Parser for BLS "Union Members" Table 4
 * (https://www.bls.gov/news.release/union2.t04.htm) — median weekly earnings
 * of full-time wage & salary workers by union affiliation and occupation.
 *
 * Kept separate (and dependency-free) so it can be unit-tested outside Deno.
 */

// Table 4 rows we keep → app occupation groups (SOC major groups)
export const UNION_GROUPS: Array<{ group: string; match: RegExp; soc: string[] }> = [
  { group: 'total', match: /^total(,?\s*16 years and over)?$/i, soc: ['00'] },
  { group: 'service', match: /^service occupations/i, soc: ['31', '33', '35', '37', '39'] },
  { group: 'healthcare_support', match: /^healthcare support/i, soc: ['31'] },
  { group: 'protective', match: /^protective service/i, soc: ['33'] },
  { group: 'food_prep', match: /^food preparation and serving/i, soc: ['35'] },
  { group: 'building_cleaning', match: /^building and grounds cleaning/i, soc: ['37'] },
  { group: 'personal_care', match: /^personal care and service/i, soc: ['39'] },
  { group: 'sales', match: /^sales and related/i, soc: ['41'] },
  { group: 'office', match: /^office and administrative support/i, soc: ['43'] },
  { group: 'construction', match: /^construction and extraction/i, soc: ['47'] },
  { group: 'installation', match: /^installation, maintenance,? and repair/i, soc: ['49'] },
  { group: 'production', match: /^production occupations/i, soc: ['51'] },
  { group: 'transportation', match: /^transportation and material moving/i, soc: ['53'] },
];

/** Tolerant parser for the BLS release table (rows = <tr>, cells = <th>/<td>). */
export function parseUnionTable(html: string) {
  const text = (s: string) =>
    s.replace(/<sup[\s\S]*?<\/sup>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  // Data year = the latest year mentioned in the table header
  const thead = html.match(/<thead[\s\S]*?<\/thead>/i)?.[0] ?? html.slice(0, 20000);
  const years = [...thead.matchAll(/\b(20\d\d)\b/g)].map((m) => Number(m[1]));
  if (!years.length) throw new Error('Could not find data year in union table');
  const year = String(Math.max(...years));

  const found = new Map<string, { group: string; label: string; soc: string[]; unionWeekly: number; nonunionWeekly: number }>();
  // Every labelled row we saw (for diagnosing layout changes)
  const seen: Array<{ label: string; nums: number[] }> = [];
  for (const tr of html.split(/<tr\b[^>]*>/i).slice(1)) {   // drop the whole <tr ...> tag (rows carry class="greenbar")
    const cells = tr.split(/<\/t[hd]>/i).map(text).filter((c) => c.length > 0);
    if (cells.length < 4) continue;
    // Label: strip leader dots / footnote markers like "(1)"
    const label = cells[0].replace(/^[^<>]*>\s*/, '').replace(/\.{2,}/g, ' ').replace(/\(\s*\d+\s*\)/g, '').replace(/\s+/g, ' ').trim();
    const nums = cells.slice(1)
      .map((c) => c.replace(/[$,\s]/g, '')
      .replace(/\(\s*\d+\s*\)/g, ''))
      .filter((c) => /^\d+(\.\d+)?$/.test(c))
      .map(Number);
    if (seen.length < 120) seen.push({ label, nums });
    // Each year block = [Total, Members of unions, Represented by unions, Non-union];
    // the latest year is the last block. (3-column blocks = no Total column.)
    let members: number | undefined;
    let nonunion: number | undefined;
    if (nums.length >= 4 && nums.length % 4 === 0) { const b = nums.slice(-4); members = b[1]; nonunion = b[3]; }
    else if (nums.length >= 3 && nums.length % 3 === 0) { const b = nums.slice(-3); members = b[0]; nonunion = b[2]; }
    if (!members || !nonunion) continue;
    const def = UNION_GROUPS.find((g) => g.match.test(label));
    if (!def || found.has(def.group)) continue;       // first occurrence = occupation section
    found.set(def.group, { group: def.group, label, soc: def.soc, unionWeekly: members, nonunionWeekly: nonunion });
  }
  const missing = UNION_GROUPS.map((g) => g.group).filter((g) => !found.has(g));
  return { year, rows: [...found.values()], missing, seen };
}

