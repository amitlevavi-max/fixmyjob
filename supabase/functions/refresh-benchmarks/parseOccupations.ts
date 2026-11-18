/**
 * Parsers for the occupation catalogue import (pure functions, no I/O).
 *
 *  - BLS `oe.occupation` (tab-separated): every occupation OEWS publishes.
 *  - O*NET `job_titles.csv`: ~57k everyday / alternate job titles mapped to
 *    O*NET-SOC codes (e.g. "Front Desk Agent" → 43-4081.00).
 */

export interface BlsOccupation { soc: string; title: string; majorGroup: string }

/**
 * Leaf occupations from oe.occupation. A code is a leaf when no other code
 * refines it (detailed codes like 435081, and broad codes such as 512090 that
 * OEWS publishes without detail). '000000' and group headers are dropped.
 */
export function parseBlsOccupations(text: string): BlsOccupation[] {
  const rows: Array<{ code: string; title: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t');
    const code = cols[0]?.trim();
    if (!code || !/^\d{6}$/.test(code)) continue;           // skips the header
    const title = (cols[1] ?? '').trim();
    if (!title) continue;
    rows.push({ code, title });
  }
  const codes = rows.map((r) => r.code);
  const out: BlsOccupation[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.code === '000000' || seen.has(r.code)) continue;
    const prefix = r.code.replace(/0+$/, '');
    const refined = codes.some((c) => c !== r.code && c.startsWith(prefix));
    if (refined) continue;
    seen.add(r.code);
    out.push({
      soc: `${r.code.slice(0, 2)}-${r.code.slice(2)}`,
      title: r.title.replace(/\s+/g, ' '),
      majorGroup: r.code.slice(0, 2),
    });
  }
  return out;
}

/** Minimal RFC-4180 CSV parser (quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface OnetTitle { onetSoc: string; title: string }

/** Rows of O*NET job_titles.csv → { O*NET-SOC code, everyday title }. */
export function parseOnetJobTitles(text: string): OnetTitle[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const codeIdx = header.findIndex((h) => h.startsWith('o*net-soc code'));
  const titleIdx = header.findIndex((h) => h === 'job title' || h === 'alternate title');
  const shortIdx = header.findIndex((h) => h === 'short title');
  const occIdx = header.findIndex((h) => h === 'title');          // O*NET occupation name
  if (codeIdx < 0 || titleIdx < 0) {
    throw new Error(`Unexpected O*NET header: ${rows[0].join(' | ').slice(0, 200)}`);
  }
  const out: OnetTitle[] = [];
  for (const r of rows.slice(1)) {
    const code = (r[codeIdx] ?? '').trim();
    if (!/^\d{2}-\d{4}\.\d{2}$/.test(code)) continue;
    for (const t of [r[titleIdx], shortIdx >= 0 ? r[shortIdx] : '', occIdx >= 0 ? r[occIdx] : '']) {
      const title = (t ?? '').trim().replace(/\s+/g, ' ');
      if (title.length >= 2) out.push({ onetSoc: code, title });
    }
  }
  return out;
}

/**
 * Map an O*NET-SOC code (43-4081.00) to an OEWS occupation: the exact SOC if
 * OEWS publishes it, otherwise the OEWS code for the same broad group
 * (e.g. 51-2092 → 51-2090 when OEWS only publishes the broad level).
 */
export function makeSocMapper(oewsSocs: Iterable<string>) {
  const exact = new Set(oewsSocs);
  const byBroad = new Map<string, string>();
  for (const s of exact) {
    const broad = s.slice(0, 6);                   // '51-209'
    if (!byBroad.has(broad) || s.endsWith('0')) byBroad.set(broad, s);
  }
  return (onetSoc: string): string | null => {
    const soc = onetSoc.slice(0, 7);
    if (exact.has(soc)) return soc;
    const merged = OEWS_MERGED[soc];
    if (merged && exact.has(merged)) return merged;
    return byBroad.get(soc.slice(0, 6)) ?? null;
  };
}

/**
 * SOC codes OEWS publishes only inside a combined code that the broad-group
 * rule above would get wrong (53-104x: the broad group also holds 53-1041,
 * aircraft cargo handling supervisors).
 */
export const OEWS_MERGED: Record<string, string> = {
  '53-1042': '53-1047',   // supervisors of helpers, laborers and material movers, hand
  '53-1043': '53-1047',   // supervisors of material-moving machine and vehicle operators
  '53-1044': '53-1047',   // supervisors of passenger attendants
  '53-1049': '53-1047',   // supervisors of transportation workers, all other
};
