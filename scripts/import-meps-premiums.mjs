/**
 * What health insurance costs in each state, and how much of it the employer
 * pays — AHRQ Medical Expenditure Panel Survey, Insurance Component (MEPS-IC),
 * private-sector state tables X.C (single), X.D (family), X.E (employee-plus-one).
 * Into Supabase table meps_ic_premiums (migration 20261106000000_health_insurance.sql).
 *
 * Runs on your PC. Needs the PDF reader once:  npm install --no-save pdfjs-dist
 *
 * PowerShell, from the project folder:
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
 *   node scripts/import-meps-premiums.mjs
 *
 * Options:
 *   --year 2025         survey year (default 2025; AHRQ publishes each year around July)
 *   --file <path.pdf>   use a PDF you downloaded (if the download from AHRQ fails):
 *                       https://meps.ahrq.gov/mepsweb/data_stats/summ_tables/insr/state/series_10/2025/ic25_xc_e.pdf
 *   --dry               read and check, write the review file, don't upload
 *
 * Nothing is uploaded unless all 52 lines (US + 50 states + DC) of all nine
 * tables were read and premium = employee + employer holds for every line.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseTables, toRows } from './meps/parse.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const year = Number(opt('year') ?? 2025);
const file = opt('file');
const dry = args.includes('--dry');
const yy = String(year).slice(2);
const pdfUrl = `https://meps.ahrq.gov/mepsweb/data_stats/summ_tables/insr/state/series_10/${year}/ic${yy}_xc_e.pdf`;

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dry && (!url || !key)) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (or add --dry).'); process.exit(1); }

let pdfjs;
try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
catch { console.error('The PDF reader is missing. Run once:  npm install --no-save pdfjs-dist'); process.exit(1); }

// ── The PDF ─────────────────────────────────────────────────────────────────
let bytes;
if (file) bytes = new Uint8Array(readFileSync(file));
else {
  console.log(`Downloading ${pdfUrl}`);
  try {
    const r = await fetch(pdfUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    console.error(`Download failed (${e.message}). Open the link above in your browser, save the PDF, and run again with --file <path>.`);
    process.exit(1);
  }
}

/** Text lines, top to bottom, page by page (items on the same baseline joined left to right) */
async function pdfLines(data) {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const lines = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { items } = await page.getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s.trim()).join(' '));
  }
  return lines;
}

const lines = await pdfLines(bytes);
const { rows, problems } = toRows(parseTables(lines), year);
mkdirSync('data/meps', { recursive: true });
const review = `data/meps/meps-ic-${year}.json`;
writeFileSync(review, JSON.stringify({ year, source: file ?? pdfUrl, rows }, null, 1));

const us = (c) => rows.find((r) => r.state === 'US' && r.coverage === c);
for (const c of ['single', 'plus_one', 'family']) {
  const r = us(c);
  if (r) console.log(`US ${c.padEnd(8)} premium $${r.premium?.toLocaleString()} · employee $${r.employee?.toLocaleString()} · employer $${r.employer?.toLocaleString()}`);
}
console.log(`${rows.length} rows · review file ${review}`);
if (problems.length) {
  console.error(`\nNot uploaded — ${problems.length} problem(s) reading the PDF:\n  ${problems.slice(0, 20).join('\n  ')}`);
  console.error(`\n(${lines.length} text lines read. If AHRQ changed the layout, send the PDF to Claude.)`);
  process.exit(1);
}
if (dry) process.exit(0);

const db = createClient(url, key, { auth: { persistSession: false } });
const { error } = await db.from('meps_ic_premiums')
  .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'year,state,coverage' });
if (error) { console.error(`Upload failed: ${error.message}\n(Has the migration been pushed? npx supabase db push)`); process.exit(1); }
console.log('Uploaded. Done.');
