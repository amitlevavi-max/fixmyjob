/**
 * Load college programs (associate degree and up) that lead to each
 * occupation into Supabase table degree_programs
 * (migration 20261020010000_degree_programs.sql).
 *
 * Sources (all official, free, no key):
 *  - IPEDS Completions C<year>_A — which schools award which 6-digit program,
 *    at which level, and how many graduates (NCES)
 *  - NCES CIP 2020 → SOC 2018 crosswalk — which occupations a program leads to
 *  - College Scorecard, field-of-study file — earnings 1 and 5 years after
 *    completing, median student debt, online (U.S. Dept. of Education)
 *  - IPEDS HD<year> (name, city, map point, website) and IC<year>_AY (tuition)
 *
 * Run from the project folder (PowerShell), about 2–5 minutes:
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key: Supabase → Project Settings → API>"
 *   node scripts/import-degree-programs.mjs
 * Optional: --dry-run (no database writes; prints a summary and a sample),
 *           --dir <folder> (use already-downloaded files instead of downloading).
 *
 * Safe to re-run (yearly, after IPEDS / Scorecard publish new data): rows are
 * upserted by id; rows not in the new files are removed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

// ── Small helpers (no extra packages) ───────────────────────────────────────

/** Files in a .zip (deflate or stored). Returns name → Buffer. */
export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(local + 26), lxlen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lnlen + lxlen;
    const data = buf.subarray(start, start + csize);
    if (!name.endsWith('/')) out[name] = method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null;
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

const xmlDecode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Rows of one sheet of an .xlsx file (array of { column letter: text }). */
export function readXlsxSheet(buf, sheetName) {
  const files = unzip(buf);
  const text = (n) => (files[n] ? files[n].toString('utf8') : '');
  const strings = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => xmlDecode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')));
  const wb = text('xl/workbook.xml');
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0])
    .find((tag) => (tag.match(/name="([^"]*)"/) || [])[1] === sheetName);
  if (!sheet) throw new Error(`sheet "${sheetName}" not found`);
  const rid = (sheet.match(/r:id="([^"]+)"/) || [])[1];
  const rels = text('xl/_rels/workbook.xml.rels');
  const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
    .find((tag) => tag.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error(`sheet "${sheetName}" file not found`);
  const xml = text(`xl/${target.replace(/^\/?xl\//, '')}`);
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((m) => {
    const row = {};
    for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = (c[2].match(/t="(\w+)"/) || [])[1];
      const v = ((c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const inline = ((c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
      row[c[1]] = type === 's' ? strings[Number(v)] : type === 'inlineStr' ? xmlDecode(inline ?? '') : v != null ? xmlDecode(v) : '';
    }
    return row;
  });
}

/** One CSV line → fields (quoted fields, "" escapes). */
export function csvLine(line) {
  const out = []; let f = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(f); f = ''; }
    else f += c;
  }
  out.push(f.replace(/\r$/, ''));
  return out;
}

/** CSV text → { header index, rows as arrays } (BOM-safe) */
export function readCsv(text) {
  const lines = text.replace(/^﻿/, '').split('\n');
  const head = csvLine(lines[0]).map((h) => h.trim().toUpperCase());
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));
  return { ix, rows: lines.slice(1).filter((l) => l.trim()).map(csvLine) };
}

const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || /^(PS|NA|NULL|PRIVACYSUPPRESSED|\.)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Map a SOC 2018 code to the OEWS occupation list (exact, merged code, or broad group). */
export function makeSocMapper(oewsSocs) {
  const exact = new Set(oewsSocs);
  const merged = { '53-1042': '53-1047', '53-1043': '53-1047', '53-1044': '53-1047', '53-1049': '53-1047' };
  const byBroad = new Map();
  for (const s of exact) { const b = s.slice(0, 6); if (!byBroad.has(b) || s.endsWith('0')) byBroad.set(b, s); }
  return (soc) => {
    const s = soc.slice(0, 7);
    if (exact.has(s)) return s;
    if (merged[s] && exact.has(merged[s])) return merged[s];
    return byBroad.get(s.slice(0, 6)) ?? null;
  };
}

// IPEDS award level → [our name, O*NET RL level, Scorecard CREDLEV]
export const AWARD_LEVELS = {
  3: ['associate', 5, '2'],
  5: ['bachelor', 6, '3'],
  6: ['post_bacc_cert', 7, '4'],
  7: ['master', 8, '5'],
  8: ['post_master_cert', 9, '8'],
  17: ['doctor_research', 11, '6'],
  18: ['doctor_professional', 10, '7'],
  19: ['doctor_other', 11, '6'],
};

// ── Build the rows ──────────────────────────────────────────────────────────

/**
 * @param {object} f  completionsCsv, hdCsv, icCsv (texts), crosswalkRows (xlsx rows),
 *                    fosCsv (text), oewsSocs (string[]), dataYear (label)
 */
export function buildRows(f) {
  // 1. Program (6-digit CIP) → OEWS occupations, with the CIP title
  const toOews = makeSocMapper(f.oewsSocs);
  const cipSocs = new Map(); const cipTitle = new Map();
  const head = f.crosswalkRows[0] ?? {};
  const col = (name) => Object.keys(head).find((k) => String(head[k]).trim().toLowerCase() === name.toLowerCase());
  const cCip = col('CIP2020Code'), cTitle = col('CIP2020Title'), cSoc = col('SOC2018Code');
  if (!cCip || !cSoc) throw new Error('crosswalk header not recognised');
  for (const r of f.crosswalkRows.slice(1)) {
    const cip = String(r[cCip] ?? '').trim(), soc = String(r[cSoc] ?? '').trim();
    if (!/^\d{2}\.\d{4}$/.test(cip) || !/^\d{2}-\d{4}$/.test(soc)) continue;
    const o = toOews(soc);
    if (!o) continue;
    if (!cipSocs.has(cip)) cipSocs.set(cip, new Set());
    cipSocs.get(cip).add(o);
    if (cTitle && r[cTitle]) cipTitle.set(cip, String(r[cTitle]).trim().replace(/\.$/, ''));
  }

  // 2. Schools (HD) and tuition (IC_AY)
  const hd = readCsv(f.hdCsv);
  const schools = new Map();
  for (const r of hd.rows) {
    const closed = (r[hd.ix.CLOSEDAT] ?? '').trim();
    if (closed && closed !== '-2') continue;                       // -2 = not closed
    let url = (r[hd.ix.WEBADDR] ?? '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    schools.set(r[hd.ix.UNITID], {
      name: r[hd.ix.INSTNM], city: r[hd.ix.CITY], state: r[hd.ix.STABBR],
      lat: num(r[hd.ix.LATITUDE]), lon: num(r[hd.ix.LONGITUD]), url: url || null,
    });
  }
  const ic = readCsv(f.icCsv);
  const tuition = new Map();
  const sum = (r, a, b) => { const x = num(r[ic.ix[a]]), y = num(r[ic.ix[b]]); return x == null ? null : x + (y ?? 0); };
  for (const r of ic.rows) {
    tuition.set(r[ic.ix.UNITID], {
      ugIn: sum(r, 'TUITION2', 'FEE2'), ugOut: sum(r, 'TUITION3', 'FEE3'),
      grIn: sum(r, 'TUITION6', 'FEE6'), grOut: sum(r, 'TUITION7', 'FEE7'),
    });
  }

  // 3. Scorecard figures by school × 4-digit CIP × credential level
  const fos = readCsv(f.fosCsv);
  const need = ['UNITID', 'CIPCODE', 'CREDLEV', 'CIPDESC', 'DISTANCE', 'EARN_MDN_1YR', 'EARN_MDN_5YR', 'EARN_MDN_4YR', 'EARN_COUNT_WNE_1YR', 'DEBT_ALL_STGP_EVAL_MDN', 'DEBT_ALL_STGP_EVAL_MDN10YRPAY'];
  const missing = need.filter((k) => !(k in fos.ix));
  if (missing.length) throw new Error(`Scorecard file is missing columns: ${missing.join(', ')}`);
  const score = new Map();
  for (const r of fos.rows) {
    const g = (k) => r[fos.ix[k]];
    score.set(`${g('UNITID')}|${String(g('CIPCODE')).padStart(4, '0')}|${g('CREDLEV')}`, {
      field: String(g('CIPDESC') ?? '').trim().replace(/\.$/, ''),
      online: g('DISTANCE') === '3' ? 'full' : g('DISTANCE') === '2' ? 'partial' : null,
      earn1: num(g('EARN_MDN_1YR')), earn5: num(g('EARN_MDN_5YR')) ?? num(g('EARN_MDN_4YR')),
      earnN: num(g('EARN_COUNT_WNE_1YR')),
      debt: num(g('DEBT_ALL_STGP_EVAL_MDN')), monthly: num(g('DEBT_ALL_STGP_EVAL_MDN10YRPAY')),
    });
  }

  // 4. One row per school × program × level with graduates
  const comp = readCsv(f.completionsCsv);
  const rows = new Map();
  const stats = { completions: comp.rows.length, kept: 0, noOccupation: 0, noSchool: 0, withEarnings: 0 };
  for (const r of comp.rows) {
    const g = (k) => r[comp.ix[k]];
    if (g('MAJORNUM') !== '1') continue;
    const level = AWARD_LEVELS[Number(g('AWLEVEL'))];
    if (!level) continue;
    const grads = num(g('CTOTALT'));
    if (!(grads > 0)) continue;
    const cip = String(g('CIPCODE')).trim();
    const socs = cipSocs.get(cip);
    if (!socs) { stats.noOccupation++; continue; }
    const unitid = g('UNITID');
    const school = schools.get(unitid);
    if (!school) { stats.noSchool++; continue; }
    const [award, onetLevel, credlev] = level;
    const sc = score.get(`${unitid}|${cip.replace('.', '').slice(0, 4)}|${credlev}`) ?? null;
    const tu = tuition.get(unitid);
    const graduate = onetLevel >= 7;
    const id = `${unitid}|${cip}|${award}`;
    if (sc?.earn1 != null) stats.withEarnings++;
    rows.set(id, {
      id, unitid, school: school.name, cip, cip_title: cipTitle.get(cip) ?? null,
      award_level: award, onet_level: onetLevel, socs: [...socs].sort(), graduates: Math.round(grads),
      state: school.state, city: school.city, lat: school.lat, lon: school.lon, url: school.url,
      online: sc?.online ?? null, earnings_field: sc?.field ?? null,
      earn_1yr: sc?.earn1 ?? null, earn_5yr: sc?.earn5 ?? null, earn_n: sc?.earnN ?? null,
      debt_median: sc?.debt ?? null, debt_monthly: sc?.monthly ?? null,
      tuition_in: tu ? (graduate ? tu.grIn : tu.ugIn) : null,
      tuition_out: tu ? (graduate ? tu.grOut : tu.ugOut) : null,
      data_year: f.dataYear,
    });
  }
  stats.kept = rows.size;
  return { rows: [...rows.values()], stats };
}

// ── Downloads ────────────────────────────────────────────────────────────────

const UA = { 'User-Agent': 'FixMyJob-degree-import/1.0' };
const IPEDS = 'https://nces.ed.gov/ipeds/datacenter/data';
const CROSSWALK_URL = 'https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_SOC2018_Crosswalk.xlsx';
const SCORECARD_PAGE = 'https://collegescorecard.ed.gov/data/';

async function download(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
const exists = async (url) => { try { const r = await fetch(url, { method: 'HEAD', headers: UA }); return r.ok; } catch { return false; } };
const firstCsv = (zipBuf) => {
  const files = unzip(zipBuf);
  const name = Object.keys(files).find((n) => /\.csv$/i.test(n) && !/_rv\.csv$/i.test(n)) ?? Object.keys(files).find((n) => /\.csv$/i.test(n));
  if (!name) throw new Error('no CSV in zip');
  return files[name].toString('utf8');
};

/** Newest IPEDS year that has the file (tries this year back 4 years) */
async function latestIpeds(prefix, suffix = '') {
  for (let y = new Date().getFullYear(); y >= new Date().getFullYear() - 4; y--) {
    const url = `${IPEDS}/${prefix}${y}${suffix}.zip`;
    if (await exists(url)) return { year: y, url };
  }
  throw new Error(`no IPEDS ${prefix}…${suffix} file found`);
}

async function loadInputs(dir) {
  if (dir) {
    const f = (n) => readFileSync(join(dir, n));
    const csvFrom = (n) => (n.endsWith('.zip') ? firstCsv(f(n)) : f(n).toString('utf8'));
    const pick = (re) => { const n = readdirSync(dir).find((x) => re.test(x)); if (!n) throw new Error(`no file matching ${re} in ${dir}`); return n; };
    return {
      completionsCsv: csvFrom(pick(/^C\d{4}_A\.(zip|csv)$/i)), hdCsv: csvFrom(pick(/^HD\d{4}\.(zip|csv)$/i)),
      icCsv: csvFrom(pick(/^IC\d{4}_AY\.(zip|csv)$/i)), fosCsv: csvFrom(pick(/Field-of-Study.*\.(zip|csv)$/i)),
      crosswalkRows: readXlsxSheet(f(pick(/Crosswalk.*\.xlsx$/i)), 'CIP-SOC'), dataYear: `local files (${dir})`,
    };
  }
  console.log('Finding the newest files…');
  const c = await latestIpeds('C', '_A');
  const hdY = (await exists(`${IPEDS}/HD${c.year}.zip`)) ? c.year : (await latestIpeds('HD')).year;
  const ic = await latestIpeds('IC', '_AY');
  const page = (await download(SCORECARD_PAGE)).toString('utf8');
  const fosUrl = (page.match(/https:\/\/[^"']*Most-Recent-Cohorts-Field-of-Study[^"']*\.zip/) || [])[0];
  if (!fosUrl) throw new Error('College Scorecard field-of-study download link not found on ' + SCORECARD_PAGE);
  const release = (fosUrl.match(/_(\d{2})(\d{2})(\d{4})\.zip/) || []).slice(1);
  console.log(`  IPEDS completions ${c.year}, directory ${hdY}, tuition ${ic.year}; Scorecard ${fosUrl.split('/').pop()}`);
  console.log('Downloading (about 50 MB)…');
  const [cz, hz, iz, xw, fz] = await Promise.all([
    download(c.url), download(`${IPEDS}/HD${hdY}.zip`), download(ic.url), download(CROSSWALK_URL), download(fosUrl),
  ]);
  return {
    completionsCsv: firstCsv(cz), hdCsv: firstCsv(hz), icCsv: firstCsv(iz), fosCsv: firstCsv(fz),
    crosswalkRows: readXlsxSheet(xw, 'CIP-SOC'),
    dataYear: `IPEDS ${c.year} · Scorecard ${release.length ? `${release[2]}-${release[0]}` : 'latest'}`,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const dirAt = args.indexOf('--dir');
  const dir = dirAt >= 0 ? args[dirAt + 1] : null;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const socs = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('occupations').select('soc').order('soc').range(from, from + 999);
    if (error) throw new Error(`occupations: ${error.message}`);
    socs.push(...data.map((r) => r.soc));
    if (data.length < 1000) break;
  }
  if (socs.length < 500) throw new Error(`only ${socs.length} occupations in the database`);

  const inputs = await loadInputs(dir);
  console.log('Building rows…');
  const { rows, stats } = buildRows({ ...inputs, oewsSocs: socs });
  console.log(`  ${stats.kept} programs (${stats.withEarnings} with Scorecard earnings) from ${stats.completions} completion rows; ` +
    `${stats.noOccupation} programs map to no occupation, ${stats.noSchool} at schools no longer listed`);
  if (rows.length < 5000) throw new Error(`only ${rows.length} programs — something is wrong with the files; nothing written`);
  if (dry) { console.log(JSON.stringify(rows.slice(0, 3), null, 2)); console.log('Dry run — nothing written.'); return; }

  const importedAt = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from('degree_programs').upsert(rows.slice(i, i + 1000).map((r) => ({ ...r, imported_at: importedAt })), { onConflict: 'id' });
    if (error) { console.error(`\nBatch at ${i} failed: ${error.message}`); process.exit(1); }
    process.stdout.write(`\r${Math.min(i + 1000, rows.length)} / ${rows.length}`);
  }
  const { error: delErr, count } = await db.from('degree_programs').delete({ count: 'exact' }).lt('imported_at', importedAt);
  if (delErr) console.error(`\nCleanup failed: ${delErr.message}`);
  console.log(`\nDone. ${count ?? 0} old rows removed.`);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/import-degree-programs.mjs')) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
