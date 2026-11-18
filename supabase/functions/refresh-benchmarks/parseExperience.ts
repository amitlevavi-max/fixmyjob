/**
 * O*NET "Related Work Experience" (element 3.A.1, scale RW).
 *
 * For each occupation, O*NET asks workers (or analysts) how much related work
 * experience is needed to be hired. Answers are given as the % of respondents
 * in each of 11 categories:
 *   1 none · 2 ≤1 month · 3 1–3 months · 4 3–6 months · 5 6–12 months
 *   6 1–2 years · 7 2–4 years · 8 4–6 years · 9 6–8 years · 10 8–10 years · 11 >10 years
 *
 * Source file (CSV, CC BY 4.0): training_and_experience.csv (O*NET 31.0+) or
 * education_training_and_experience.csv (older releases).
 */
import { parseCsv } from './parseOccupations.ts';

export interface OnetExperience {
  onetSoc: string;           // '33-1091.00'
  dist: number[];            // index 0..10 = category 1..11, % of respondents
  n: number | null;
  suppressed: boolean;       // O*NET "Recommend Suppress" = Y (low precision)
}

export function parseRelatedExperience(text: string): OnetExperience[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (!rows.length) return [];
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const col = (name: string) => h.findIndex((x) => x === name);
  const iCode = h.findIndex((x) => x.startsWith('o*net-soc code'));
  const iScale = col('scale id');
  const iCat = col('category');
  const iVal = col('data value');
  const iN = col('n');
  const iSup = col('recommend suppress');
  if (iCode < 0 || iScale < 0 || iCat < 0 || iVal < 0) {
    throw new Error(`Unexpected O*NET experience header: ${rows[0].join(' | ').slice(0, 200)}`);
  }
  const by = new Map<string, OnetExperience>();
  for (const r of rows.slice(1)) {
    if ((r[iScale] ?? '').trim() !== 'RW') continue;
    const code = (r[iCode] ?? '').trim();
    const cat = Number(r[iCat]);
    const val = Number(r[iVal]);
    if (!/^\d{2}-\d{4}\.\d{2}$/.test(code) || !(cat >= 1 && cat <= 11) || !Number.isFinite(val)) continue;
    let e = by.get(code);
    if (!e) { e = { onetSoc: code, dist: new Array(11).fill(0), n: null, suppressed: false }; by.set(code, e); }
    e.dist[cat - 1] = val;
    const n = iN >= 0 ? Number(r[iN]) : NaN;
    if (Number.isFinite(n)) e.n = Math.max(e.n ?? 0, n);
    if (iSup >= 0 && (r[iSup] ?? '').trim().toUpperCase() === 'Y') e.suppressed = true;
  }
  return [...by.values()].filter((e) => e.dist.some((v) => v > 0));
}

/** Category (1–11) at a cumulative percentile of the distribution. */
export function categoryAt(dist: number[], pct: number): number {
  const total = dist.reduce((s, v) => s + v, 0) || 1;
  let cum = 0;
  for (let i = 0; i < dist.length; i++) {
    cum += (dist[i] / total) * 100;
    if (cum >= pct) return i + 1;
  }
  return dist.length;
}
