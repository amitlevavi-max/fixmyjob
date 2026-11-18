/**
 * Parsers for the place data behind "where does my job pay more?"
 * (pure functions, no I/O).
 *
 *  - BLS `oe.area` (tab-separated): every OEWS state and metro / non-metro
 *    area, e.g.  36 | 0035620 | M | New York-Newark-Jersey City, NY-NJ
 *  - BEA Regional Price Parities CSV (SARPP / MARPP tables): cost of living,
 *    US = 100, by state and by metro (CBSA).
 */

import { parseCsv } from './parseOccupations.ts';

export const STATE_ABBR_BY_FIPS: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC',
  '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY',
  '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT',
  '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH',
  '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY',
};

export interface WageArea {
  area_type: 'state' | 'metro';
  area_code: string;       // state FIPS '36' / OEWS metro code '0035620'
  name: string;
  short_name: string;
  state_abbrs: string[];
  cbsa: string | null;
  is_nonmetro: boolean;
}

/** "New York-Newark-Jersey City, NY-NJ" → "New York" */
export function shortMetroName(name: string): string {
  const head = name.split(',')[0].trim();
  if (/nonmetropolitan/i.test(head)) {
    return head.replace(/\s*nonmetropolitan area\s*/i, '').trim() + ' (rural)';
  }
  return head.split('-')[0].trim();
}

export function parseBlsAreas(text: string): WageArea[] {
  const out: WageArea[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cols = line.split('\t').map((c) => c.trim());
    if (cols.length < 4 || !/^\d{2}$/.test(cols[0]) || !/^\d{7}$/.test(cols[1])) continue;   // header / blanks
    const [stateCode, code, type, rawName] = cols;
    const name = rawName.replace(/\s+/g, ' ');
    if (type === 'S') {
      const abbr = STATE_ABBR_BY_FIPS[stateCode];
      if (!abbr) continue;                                  // territories
      out.push({ area_type: 'state', area_code: stateCode, name, short_name: name, state_abbrs: [abbr], cbsa: null, is_nonmetro: false });
    } else if (type === 'M') {
      const nonmetro = /nonmetropolitan/i.test(name);
      const tail = name.includes(',') ? name.split(',').pop()!.trim() : '';
      const fromName = tail.split('-').map((s) => s.trim()).filter((s) => /^[A-Z]{2}$/.test(s));
      const home = STATE_ABBR_BY_FIPS[stateCode];
      const states = fromName.length ? fromName : home ? [home] : [];
      if (!states.length) continue;                         // Puerto Rico etc.
      out.push({
        area_type: 'metro',
        area_code: code,
        name,
        short_name: shortMetroName(name),
        state_abbrs: states,
        cbsa: nonmetro ? null : code.slice(-5),
        is_nonmetro: nonmetro,
      });
    }
  }
  return out;
}

export interface PriceParity { area_type: 'state' | 'metro'; area_code: string; year: string; rpp: number }

/**
 * BEA RPP CSV → latest "All items" value per area.
 * Columns: GeoFIPS, GeoName, …, LineCode, …, Description, Unit, 2008 … 2024.
 */
export function parseBeaRpp(text: string, kind: 'state' | 'metro'): PriceParity[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim().replace(/"/g, '') === 'GeoFIPS'));
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map((c) => c.trim().replace(/"/g, ''));
  const fipsIdx = header.indexOf('GeoFIPS');
  const lineIdx = header.indexOf('LineCode');
  const descIdx = header.indexOf('Description');
  const yearCols = header.map((h, i) => ({ h, i })).filter(({ h }) => /^\d{4}$/.test(h));
  const out: PriceParity[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const fips = (r[fipsIdx] ?? '').replace(/[^0-9]/g, '');
    if (fips.length !== 5) continue;
    const line = (r[lineIdx] ?? '').trim();
    const desc = (r[descIdx] ?? '').toLowerCase();
    const allItems = line === '1' || (lineIdx < 0 && desc.includes('all items'));
    if (!allItems) continue;
    // Latest year with a number
    let year = '', rpp = NaN;
    for (const { h, i } of yearCols) {
      const v = Number((r[i] ?? '').trim());
      if (Number.isFinite(v) && v > 0) { year = h; rpp = v; }
    }
    if (!year) continue;
    if (kind === 'state') {
      if (fips === '00000' || !fips.endsWith('000')) continue;
      const st = fips.slice(0, 2);
      if (!STATE_ABBR_BY_FIPS[st]) continue;
      out.push({ area_type: 'state', area_code: st, year, rpp });
    } else {
      if (fips === '00000' || fips.endsWith('998') || fips.endsWith('999')) continue;
      out.push({ area_type: 'metro', area_code: fips, year, rpp });
    }
  }
  return out;
}
