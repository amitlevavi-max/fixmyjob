/**
 * Load the Credential Engine export (Credential Finder → Credentials → Export)
 * into Supabase (Amit, 2026-11-12). See claude/credential-engine-plan.md.
 *
 * What it does
 *  1. Reads the CSV. "Resource" rows are one credential each; "Addendum" rows
 *     add extra cost lines to the Resource row above them (same CTID).
 *  2. Sorts every active row into one of:
 *       credential — issued by a government body (license / registration) or by an
 *                    industry body or company (certification, badge): something a
 *                    person HOLDS                       → table credentials
 *       course     — offered by a school or training provider (its own certificate,
 *                    diploma, associate degree, apprenticeship): something a person
 *                    TAKES                              → table training_programs (source 'credential_engine')
 *       skipped    — bachelor's degrees and above, inactive, no occupation, no state…
 *  3. Courses without an occupation code get one from their field-of-study (CIP)
 *     code: the occupations DOL-approved programs with the same CIP code lead to.
 *  4. Removes courses that are already on the DOL list (same state, same provider,
 *     same course name). The DOL row is kept (it has past-student results) and is
 *     marked with the Credential Engine ID and page.
 *  5. Links courses (DOL and Credential Engine) to the credentials they prepare for,
 *     by name, only when they share an occupation (table course_credentials).
 *
 * Run from the project folder (PowerShell), with the newest export (.csv, or .csv.gz):
 *   node --max-old-space-size=4096 scripts/import-credential-engine.mjs "C:\Users\amitl\Downloads\credential_Export.csv" --dry-run
 *     → prints what would be loaded and writes Data/credential-engine/dry-run.json; nothing is sent
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key: Supabase → Project Settings → API>"
 *   node --max-old-space-size=4096 scripts/import-credential-engine.mjs "C:\Users\amitl\Downloads\credential_Export.csv"
 *
 * Safe to re-run (monthly): rows are upserted by CTID; Credential Engine rows that are
 * no longer in the file are removed. DOL rows are never removed by this script.
 * Needs migrations 20261112000000_credential_engine.sql and 20261112010000_ce_matches_batches.sql.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname } from 'node:path';

// ── Arguments ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const csvPath = args.find((a) => !a.startsWith('--'));
const opt = (name, dflt) => { const a = args.find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : dflt; };
const ETP_FILE = opt('etp', 'Data/etp/etp_programs.json.gz');
const GEO_FILE = opt('geo', 'Data/etp/geo_points.json.gz');
const OUT_DIR = opt('out', 'Data/credential-engine');
if (!csvPath) {
  console.error('Usage: node scripts/import-credential-engine.mjs <credential_Export.csv> [--dry-run]');
  process.exit(1);
}

// ── CSV (RFC 4180: quoted fields may hold commas, quotes and line breaks) ───
/** Yields one row (array of fields) at a time, so a 130 MB export fits in modest memory */
export function* parseCsv(text) {
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') yield row;
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); yield row; }
}

// ── Lookups ──────────────────────────────────────────────────────────────────
const STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'puerto rico': 'PR', guam: 'GU', 'virgin islands': 'VI', 'u.s. virgin islands': 'VI',
};
const POSTAL = new Set(Object.values(STATES));
function toState(s) {
  const v = (s ?? '').trim();
  if (!v) return null;
  if (POSTAL.has(v.toUpperCase()) && v.length === 2) return v.toUpperCase();
  return STATES[v.toLowerCase()] ?? null;
}

// Degrees we don't suggest to this audience (bachelor's and above)
const HIGHER_DEGREE = /bachelor|master|doctor|doctoral|post-?baccalaureate|post-master|specialist degree|research/i;
const SCHOOL_TYPES = /degree|diploma|technical level|education ?level|academic certificate|basic technical|general education|secondary|ged|proficiency/i;
const GOVERNMENT = /\b(department|deptartment|dept\.?|board|commission|state of|division|secretary of state|office of|bureau|administration|coast guard|licensing|regulation|regulatory|registry|council of state)\b/i;
const COMPANY = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|ltd|company|co\.)(\W|$)/i;
const SCHOOL = /\b(colleges?|universit(y|ies)|institutes?|schools?|academy|academies|etp|technical|career cent(er|re)s?|training|polytechnic|learning|driving|vocational|district|boces|education|seminary|tech)\b|_etp\b/i;
const HOLDABLE = /^(license|certification|open badge|digital badge|badge|micro-credential|quality assurance credential|professional certificate|master trade certificate|journeyman certificate)$/i;

const TRAINING_NAME = /\b(training|course|bootcamp|boot camp|program(me)?|voucher|vouchers|self-?paced|live online|workforce development kit|exam prep|prep course|class|classes|academy|curriculum)\b/i;

/** O*NET codes "Truck Drivers (53-3032.00) | …" → ['53-3032'] */
const socsOf = (s) => [...new Set([...(s ?? '').matchAll(/\((\d{2}-\d{4})(?:\.\d{2})?\)/g)].map((m) => m[1]))];
/** CIP "Welding Technology/Welder. (48.0508)" → [{ cip, title }] */
const cipsOf = (s) => [...(s ?? '').matchAll(/([^|]*?)\s*\((\d{2}\.\d{4})\)/g)].map((m) => ({ cip: m[2], title: m[1].trim().replace(/\.$/, '') }));

const FORMAT = (s) => {
  const v = (s ?? '').toLowerCase();
  const online = /online/.test(v), inPerson = /in-person|variable site/.test(v), blended = /blended/.test(v);
  if (!v) return null;
  if (blended && !online && !inPerson) return 'hybrid';
  if ((online && inPerson) || (blended && (online || inPerson))) return 'mixed';
  if (online) return 'online';
  if (inPerson) return 'in_person';
  return null;
};

/** "50 Weeks with actual time: 1000 Hours" → { weeks: 50, hours: 1000 }. First value of a range. */
export function parseTime(s) {
  if (!s) return { weeks: null, hours: null };
  const first = s.split('|')[0];
  let hours = null; let weeks = null;
  const actual = first.match(/actual time:\s*([\d.]+)\s*hours?/i);
  if (actual) hours = Number(actual[1]);
  const main = first.replace(/with actual time:.*$/i, '').replace(/time required:/i, '');
  const unit = (re) => { const m = main.match(re); return m ? Number(m[1]) : null; };
  const yrs = unit(/([\d.]+)\s*years?/i), mos = unit(/([\d.]+)\s*months?/i), wks = unit(/([\d.]+)\s*weeks?/i),
        days = unit(/([\d.]+)\s*days?/i), hrs = unit(/([\d.]+)\s*hours?/i), mins = unit(/([\d.]+)\s*minutes?/i);
  if (yrs != null || mos != null) weeks = (yrs ?? 0) * 52 + (mos ?? 0) * 4.33;
  else if (wks != null) weeks = wks;
  else if (days != null) weeks = Math.max(1, days / 5);
  if (hours == null && hrs != null) hours = hrs;
  if (hours == null && mins != null) hours = mins / 60;
  if (weeks != null && (!(weeks > 0) || weeks > 260)) weeks = null;   // over 5 years: misreported
  if (hours != null && !(hours > 0)) hours = null;
  return { weeks: weeks != null ? Math.round(weeks * 10) / 10 : null, hours };
}

const COST_IN_TOTAL = /tuition|mixed fees|learning resource|program specific fee|technology fee|enrollment fee|application fee|assessment|exam|general fee|lab fee/i;
/** Cost lines "Cost #1 | Aggregated (ALL) Costs | 24885" → total, or null */
export function parseCost(lines) {
  let aggregated = null; let sum = 0; let any = false;
  for (const l of lines) {
    const m = l.match(/^Cost #\d+\s*\|\s*([^|]+?)\s*\|\s*([\d.,]+)\s*$/);
    if (!m) continue;
    const amount = Number(m[2].replace(/,/g, ''));
    if (!(amount >= 0)) continue;
    if (/aggregated/i.test(m[1])) aggregated = Math.max(aggregated ?? 0, amount);
    else if (COST_IN_TOTAL.test(m[1])) { sum += amount; any = true; }
  }
  const total = aggregated ?? (any ? sum : null);
  return total != null && total < 250000 ? Math.round(total) : null;
}

/** "Medical Assistant - Certification - NHA or AMCA" → { name: 'Medical Assistant', credential: 'NHA or AMCA' } */
const TYPE_WORD = /^(certificate( of completion)?|certification|license|licensure|diploma|associate(?:'s)?( degree)?|associate of [a-z ]+|aas|degree|apprenticeship( certificate)?|credential|industry[- ]recognized credential)$/i;
export function splitName(raw, typeLabel) {
  const parts = raw.split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  const i = parts.findIndex((p, k) => k > 0 && TYPE_WORD.test(p));
  if (i > 0) {
    const after = parts.slice(i + 1).join(' - ');
    return { name: parts.slice(0, i).join(' - '), credential: after || parts[i] };
  }
  return { name: raw.trim(), credential: typeLabel || null };
}

const cleanProvider = (s) => s.replace(/\s*[-–]?\s*\b(PCS_)?ETP(_ETP)*\b.*$/i, '').replace(/\s*-\s*PCS\b/gi, '').replace(/\s{2,}/g, ' ').trim();

const STOP = new Set('the of and for a an in to with at on by or inc llc corp corporation company co dba ltd'.split(' '));
const COURSE_WORDS = new Set('certificate certification certified license licensure program course training technician technology diploma level basic advanced completion of in and the'.split(' '));
const tokens = (s, extraStop) => (s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
  .filter((w) => w && !STOP.has(w) && !(extraStop && extraStop.has(w)));
const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); };
const GENERIC_PROVIDER = new Set('university college community state technical institute school district campus system center centre academy of the junior county city education continuing'.split(' '));
const provKey = (s) => {
  const all = tokens(cleanProvider(s).split(/\s+-\s+/)[0].replace(/\(.*?\)/g, ' '));
  const specific = all.filter((w) => !GENERIC_PROVIDER.has(w));
  return specific.length ? specific : all;
};

// ── Load inputs ──────────────────────────────────────────────────────────────
console.log(`Reading ${csvPath} …`);
const raw = readFileSync(csvPath);
const rowsIn = parseCsv((csvPath.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8').replace(/^\uFEFF/, ''));
const header = rowsIn.next().value;
const col = (name) => { const i = header.indexOf(name); if (i < 0) throw new Error(`Column "${name}" not found — has the export format changed?`); return i; };
const C = {
  rowType: col('Row Type'), ctid: col('CTID'), type: col('CTDL Type Label'), name: col('Name'), alt: col('Alternate Name(s)'),
  desc: col('Description'), status: col('Credential Status Type'), address: col('Address'), updated: col('Last Updated'),
  owner: col('Owned By/Offered By'), time: col('Time Estimate(s)'), occ: col('Occupation Code(s)'), cip: col('Instructional Program Code(s)'),
  delivery: col('Learning Delivery Type(s)'), web: col('Subject Webpage'), finder: col('Finder Detail Page'), costDetails: col('Estimated Cost Details'),
};
const KEEP = Object.values(C);
const records = new Map();   // CTID → { r: Resource row (only the columns used), costs: cost lines, addresses }
let current = null;
for (const full of rowsIn) {
  const r = []; for (const i of KEEP) r[i] = full[i];
  const ctid = r[C.ctid];
  if (r[C.rowType] === 'Resource') { current = { r, costs: [r[C.costDetails]], addresses: [r[C.address]] }; records.set(ctid, current); }
  else if (current && ctid === current.r[C.ctid]) { current.costs.push(r[C.costDetails]); current.addresses.push(r[C.address]); }
}
console.log(`${records.size} credentials in the file`);

const dol = JSON.parse(gunzipSync(readFileSync(ETP_FILE)).toString('utf8'));
const geo = JSON.parse(gunzipSync(readFileSync(GEO_FILE)).toString('utf8'));
const zipPoint = new Map(geo.zips.map(([z, lat, lon]) => [z, [lat, lon]]));
console.log(`${dol.length} DOL programs, ${zipPoint.size} ZIP points`);

// CIP → occupations, from DOL programs with that CIP (6-digit first, then 4-digit)
const cipCount = new Map();
for (const p of dol) {
  if (!p.cip || !p.socs?.length) continue;
  for (const key of [p.cip, p.cip.slice(0, 5)]) {
    const m = cipCount.get(key) ?? new Map();
    p.socs.forEach((s, i) => m.set(s, (m.get(s) ?? 0) + (i === 0 ? 2 : 1)));
    cipCount.set(key, m);
  }
}
function socsFromCip(cips) {
  for (const len of [7, 5]) {
    const m = new Map();
    for (const { cip } of cips) for (const [s, n] of cipCount.get(cip.slice(0, len)) ?? []) m.set(s, (m.get(s) ?? 0) + n);
    if (m.size) return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  }
  return [];
}

// ── Classify ─────────────────────────────────────────────────────────────────
// Where a provider is: many college rows have no address of their own, but the same
// provider's other rows do. Use the provider's most common state / ZIP / city.
const providerPlace = new Map();
for (const { r, addresses } of records.values()) {
  const a = (addresses.find((x) => x && x.split(';').length >= 4) ?? '').split(';').map((x) => x.trim());
  if (a.length < 4) continue;
  const st = toState(a[a.length - 2]); if (!st) continue;
  const owner = (r[C.owner] ?? '').trim();
  const m = providerPlace.get(owner) ?? new Map();
  const k = `${st}|${(a[a.length - 1].match(/^\d{5}/) ?? [''])[0]}|${a[a.length - 3]}`;
  m.set(k, (m.get(k) ?? 0) + 1); providerPlace.set(owner, m);
}
function placeOf(owner) {
  const m = providerPlace.get(owner); if (!m) return null;
  const [k] = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
  const [state, zip, city] = k.split('|');
  return { state, zip: zip || null, city: city || null };
}

const skipped = {};
const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1; };
const credentials = []; const courses = [];
const toDate = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };

for (const [ctid, { r, costs, addresses }] of records) {
  const type = r[C.type] ?? ''; const owner = (r[C.owner] ?? '').trim();
  if (r[C.status] !== 'Active') { skip('not active'); continue; }
  if (HIGHER_DEGREE.test(type)) { skip("bachelor's degree or higher"); continue; }
  const addr = (addresses.find((a) => a && a.split(';').length >= 4) ?? '').split(';').map((x) => x.trim());
  const [street, city, stateRaw, zipRaw] = addr.length >= 4 ? [addr.slice(0, addr.length - 3).join(', '), addr[addr.length - 3], addr[addr.length - 2], addr[addr.length - 1]] : [];
  let state = toState(stateRaw);
  let zip = (zipRaw ?? '').match(/^\d{5}/)?.[0] ?? null;
  let cityName = city || null; let placeInferred = false;
  if (!state) { const p = placeOf(owner); if (p) { ({ state, zip } = p); cityName = p.city; placeInferred = true; } }
  const cips = cipsOf(r[C.cip]);
  let socs = socsOf(r[C.occ]);
  const common = {
    name: r[C.name].trim(), description: (r[C.desc] ?? '').trim().slice(0, 3000) || null,
    url: /^https?:\/\//.test(r[C.web] ?? '') ? r[C.web].trim() : null, ce_finder_url: r[C.finder] || null,
    ce_updated_at: toDate(r[C.updated]),
  };

  const government = GOVERNMENT.test(owner) && !COMPANY.test(owner) && !SCHOOL.test(owner.replace(/department of (higher )?education/i, ''));
  const school = !government && (SCHOOL.test(owner) || SCHOOL_TYPES.test(type));
  const holdable = HOLDABLE.test(type.trim());
  // Training offers published as "credentials" (e.g. "CompTIA A+ Live Online Training Program - Certification - …",
  // "HI-6000 Medical Assistant - Certification - CCMA") are courses: the name says so
  const trainingName = TRAINING_NAME.test(r[C.name]) || splitName(r[C.name], type).name !== r[C.name].trim();
  const isCredential = government ? !SCHOOL_TYPES.test(type) : (!school && !trainingName && (holdable || !addr.length));

  if (isCredential) {
    // Licenses often have no codes: kept, and matched to an occupation by name in the database
    // (match_credential_socs). Industry credentials without codes can't be placed — skipped.
    if (!socs.length && !cips.length && !(government && /license/i.test(type))) { skip('industry credential without occupation or field code'); continue; }
    credentials.push({
      id: ctid, ...common, alternate_names: r[C.alt] || null,
      kind: /license/i.test(type) ? 'license' : /badge|micro/i.test(type) ? 'badge' : /apprentice|journeyman|master trade/i.test(type) ? 'apprenticeship' : 'certification',
      type_label: type, issuer: owner, issuer_type: government ? 'government' : 'industry',
      state: government ? state : null, socs, cips: cips.map((c) => c.cip), status: 'active',
      socs_inferred: null, soc_checked: false,   // licenses without codes are matched again after each load
    });
    continue;
  }

  // Course
  let inferred = false;
  if (!socs.length) { socs = socsFromCip(cips); inferred = socs.length > 0; }
  if (!socs.length) { skip('course without occupation (no SOC, no usable CIP)'); continue; }
  const format = FORMAT(r[C.delivery]);
  if (!state && format !== 'online') { skip('course without a state'); continue; }
  const { weeks, hours } = parseTime(r[C.time]);
  const { name, credential } = splitName(common.name, type);
  const pt = zip ? zipPoint.get(zip) : null;
  courses.push({
    id: ctid, provider_id: null, provider: cleanProvider(owner) || owner, name, credential,
    cip: cips[0]?.cip ?? null, cip_title: cips[0]?.title ?? null, socs, socs_inferred: inferred,
    state, reporting_state: null, city: cityName, zip, lat: pt?.[0] ?? null, lon: pt?.[1] ?? null, format,
    url: common.url, tuition: parseCost(costs), supplies: null, weeks,
    hours_per_week: hours != null ? Math.round((hours / Math.max(weeks ?? 1, 1)) * 10) / 10 : null,
    address: street && !placeInferred ? `${street}, ${city}, ${state ?? stateRaw} ${zip ?? ''}`.trim() : null,
    description: common.description, prerequisites: null, exited: null, completion_rate: null, employed_q2_rate: null,
    employed_q4_rate: null, median_q2_earnings: null, credential_rate: null, reported_at: null,
    source: 'credential_engine', ce_ctid: ctid, ce_finder_url: common.ce_finder_url, ce_updated_at: common.ce_updated_at,
    _type: type, _rawName: common.name, _placeInferred: placeInferred,
  });
}

// ── Dedupe against DOL ───────────────────────────────────────────────────────
const dolByState = new Map();
for (const p of dol) { const k = p.state ?? '?'; (dolByState.get(k) ?? dolByState.set(k, []).get(k)).push(p); }
const dolTok = new Map(dol.map((p) => [p.id, { prov: provKey(p.provider), name: tokens(p.name, COURSE_WORDS) }]));
const dolMatches = [];           // { id (DOL), ce_ctid, ce_finder_url, ce_updated_at }
const usedDol = new Set();
const keptCourses = [];
for (const c of courses) {
  const prov = provKey(c.provider); const nm = tokens(c.name, COURSE_WORDS);
  let best = null; let bestScore = 0;
  for (const p of dolByState.get(c.state ?? '?') ?? []) {
    if (usedDol.has(p.id)) continue;
    const t = dolTok.get(p.id);
    const ps = jaccard(prov, t.prov); if (ps < 0.5) continue;
    const ns = nm.length && t.name.length ? jaccard(nm, t.name) : (c.name.toLowerCase() === p.name.toLowerCase() ? 1 : 0);
    if (ns < 0.75) continue;
    const zipOk = !c.zip || !p.zip || c.zip === p.zip;
    const score = ps + ns + (zipOk ? 0.5 : 0) + (c.cip && c.cip === p.cip ? 0.5 : 0);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  if (best && bestScore >= 1.75) {
    usedDol.add(best.id);
    dolMatches.push({ id: best.id, ce_ctid: c.ce_ctid, ce_finder_url: c.ce_finder_url, ce_updated_at: c.ce_updated_at, _ce: `${c.provider} | ${c.name}`, _dol: `${best.provider} | ${best.name}` });
  } else keptCourses.push(c);
}

// ── Link courses to the credentials they prepare for ────────────────────────
// A credential is "named" by an acronym in its issuer, e.g. "(NCCER)", a one-word
// issuer ("Microsoft", "CompTIA"), or an acronym in its own name, e.g. "(EPA 608)".
const GENERIC_ACR = new Set(['US', 'USA', 'LLC', 'INC', 'ANSI', 'IACET', 'II', 'III', 'IV', 'CE', 'CEU', 'CEUS', 'ID']);
function credentialKeys(cr) {
  const keys = new Set();
  for (const m of cr.issuer.matchAll(/\(([A-Z][A-Za-z0-9&-]{1,11})\)/g)) keys.add(m[1]);
  if (!/\s/.test(cr.issuer.trim()) && cr.issuer.length >= 4) keys.add(cr.issuer.trim());
  for (const m of cr.name.matchAll(/\(([A-Z][A-Z0-9&-]{2,11}(?: \d{2,4})?)\)/g)) keys.add(m[1]);
  return [...keys].filter((k) => !GENERIC_ACR.has(k.toUpperCase()));
}
const keyIndex = new Map();      // lower key → credentials
for (const cr of credentials) {
  if (cr.issuer_type !== 'industry') continue;
  for (const k of credentialKeys(cr)) { const kk = k.toLowerCase(); (keyIndex.get(kk) ?? keyIndex.set(kk, []).get(kk)).push(cr); }
}
const licByStateSoc = new Map();  // 'NJ|47-2111' → government licenses
for (const cr of credentials) {
  if (cr.issuer_type !== 'government' || cr.kind !== 'license' || !cr.state) continue;
  for (const s of cr.socs) { const k = `${cr.state}|${s}`; (licByStateSoc.get(k) ?? licByStateSoc.set(k, []).get(k)).push(cr); }
}
const LIC_STOP = new Set([...COURSE_WORDS, 'state', 'class', 'type', 'registered', 'registration', 'permit', 'contractor', 'general', 'renewal', 'temporary', 'reciprocal', 'examination', 'exam']);
const stems = (s) => new Set(tokens(s, LIC_STOP).filter((w) => w.length >= 4 && !/^\d+$/.test(w)).map((w) => w.slice(0, 5)));

const CRED_STOP = new Set([...COURSE_WORDS, 'certified', 'credential', 'credentialing', 'agency', 'exam', 'online', 'live']);
const plain = (x) => ` ${(x ?? '').toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim()} `;
/** Words of a credential's name that say WHICH credential it is (not the issuer, not "certified …") */
function distinctive(cr, key) {
  const issuerWords = new Set(tokens(cr.issuer));
  key.toLowerCase().split(/\s+/).forEach((w) => issuerWords.add(w));
  return [...new Set(tokens(cr.name.replace(/\(.*?\)/g, ' '), CRED_STOP).filter((w) => !issuerWords.has(w) && w.length > 1))];
}
const links = [];
function linkCourse(courseId, text, socs, state) {
  const socSet = new Set(socs); const found = new Map();
  const words = new Set((text.match(/[A-Za-z0-9&-]+/g) ?? []).map((w) => w.toLowerCase()));
  const lower = text.toLowerCase();
  for (const [k, list] of keyIndex) {
    const hit = k.includes(' ') ? lower.includes(k) : words.has(k);
    if (!hit) continue;
    for (const cr of list) {
      const shared = cr.socs.filter((s) => socSet.has(s)).length;
      if (!shared) continue;
      // The credential's own words (without the issuer's name) must be in the course text:
      // "CompTIA Security+" fits "CompTIA Security+ Certification Training", "CompTIA Linux+" doesn't
      const own = distinctive(cr, k);
      const courseWords = new Set(tokens(text, COURSE_WORDS));
      const inCourse = own.filter((w) => courseWords.has(w)).length;
      if (own.length ? inCourse / own.length < 0.67
        // nothing left but symbols ("CompTIA A+"): the whole name must be in the course text
        : !plain(text).includes(plain(cr.name.replace(/\(.*?\)/g, ' ')))) continue;
      const score = shared + inCourse;
      if (!found.has(cr.id) || found.get(cr.id).score < score) found.set(cr.id, { cr, score, method: 'issuer_name' });
    }
  }
  if (state && /licens/i.test(text)) {
    const ts = stems(text);
    for (const s of socs) for (const cr of licByStateSoc.get(`${state}|${s}`) ?? []) {
      const cs = stems(cr.name); let n = 0; for (const x of cs) if (ts.has(x)) n++;
      if (!cs.size || n / cs.size < 0.5) continue;
      const score = 1 + n / cs.size;
      if (!found.has(cr.id) || found.get(cr.id).score < score) found.set(cr.id, { cr, score, method: 'state_license' });
    }
  }
  [...found.values()].sort((a, b) => b.score - a.score).slice(0, 3)
    .forEach(({ cr, method }) => links.push({ course_id: courseId, credential_id: cr.id, relation: 'prepares_for', match_method: method }));
}
for (const c of keptCourses) linkCourse(c.id, `${c._rawName} ${c.credential ?? ''}`, c.socs, c.state);
for (const p of dol) linkCourse(p.id, `${p.name} ${p.credential ?? ''}`, p.socs ?? [], p.state);

const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));

// ── Report ───────────────────────────────────────────────────────────────────
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});
const report = {
  file: csvPath, records: records.size,
  credentials: { total: credentials.length, by_issuer: count(credentials, (c) => c.issuer_type), by_kind: count(credentials, (c) => c.kind),
    without_occupation_to_match_by_name: credentials.filter((c) => !c.socs.length).length },
  courses: {
    from_file: courses.length, already_on_dol_list: dolMatches.length, new: keptCourses.length,
    socs_from_cip: keptCourses.filter((c) => c.socs_inferred).length,
    with_cost: keptCourses.filter((c) => c.tuition != null).length, with_hours: keptCourses.filter((c) => c.hours_per_week != null).length,
    with_location: keptCourses.filter((c) => c.lat != null).length, place_from_provider: courses.filter((c) => c._placeInferred).length, by_format: count(keptCourses, (c) => c.format ?? 'unknown'),
  },
  links: { total: links.length, by_method: count(links, (l) => l.match_method), to_dol_courses: links.filter((l) => !l.course_id.startsWith('ce-')).length },
  skipped,
};
console.log(JSON.stringify(report, null, 2));

if (DRY) {
  mkdirSync(OUT_DIR, { recursive: true });
  const credById = new Map(credentials.map((c) => [c.id, c]));
  const courseById = new Map([...keptCourses.map((c) => [c.id, `${c.provider} | ${c._rawName}`]), ...dol.map((p) => [p.id, `${p.provider} | ${p.name} (DOL)`])]);
  const sample = (arr, n) => arr.filter((_, i) => i % Math.max(1, Math.floor(arr.length / n)) === 0).slice(0, n);
  writeFileSync(`${OUT_DIR}/dry-run.json`, JSON.stringify({
    report,
    sample_credentials: sample(credentials, 30).map(({ description, ...c }) => c),
    sample_courses: sample(keptCourses, 30).map(({ description, ...c }) => c),
    sample_dol_matches: sample(dolMatches, 30),
    sample_links: sample(links, 60).map((l) => ({ course: courseById.get(l.course_id), credential: `${credById.get(l.credential_id)?.name} — ${credById.get(l.credential_id)?.issuer}`, method: l.match_method })),
  }, null, 2));
  const dump = opt('dump', null);   // testing: every row that would be sent
  if (dump) writeFileSync(dump, JSON.stringify({ credentials, courses: keptCourses.map(strip), dolMatches: dolMatches.map(strip), links }));
  console.log(`\nDry run: nothing sent. Details in ${OUT_DIR}/dry-run.json`);
  process.exit(0);
}

// ── Write to Supabase ────────────────────────────────────────────────────────
const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
const { createClient } = await import('@supabase/supabase-js');
const db = createClient(url, key, { auth: { persistSession: false } });
const importedAt = new Date().toISOString();

async function upsertAll(tableName, rows, conflict, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size).map((r) => ({ ...strip(r), imported_at: importedAt }));
    const { error } = await db.from(tableName).upsert(batch, { onConflict: conflict });
    if (error) throw new Error(`${tableName} batch at ${i}: ${error.message}`);
    process.stdout.write(`\r${tableName}: ${Math.min(i + size, rows.length)} / ${rows.length}`);
  }
  process.stdout.write('\n');
}

try {
  await upsertAll('credentials', credentials, 'id');
  await upsertAll('training_programs', keptCourses, 'id');
  // Remove Credential Engine rows that are no longer in the file (DOL rows are untouched)
  const { count: oldCourses, error: e1 } = await db.from('training_programs').delete({ count: 'exact' })
    .eq('source', 'credential_engine').lt('imported_at', importedAt);
  if (e1) throw new Error(`cleanup training_programs: ${e1.message}`);
  // Only Credential Engine's own credentials: records from CareerOneStop (source 'careeronestop') are kept (2026-11-18)
  const { count: oldCreds, error: e2 } = await db.from('credentials').delete({ count: 'exact' })
    .eq('source', 'credential_engine').lt('imported_at', importedAt);
  if (e2) throw new Error(`cleanup credentials: ${e2.message}`);
  // Mark DOL programs that are also on Credential Engine: clear earlier marks, then 500 at a time
  // (one call for all of them hit Supabase's statement timeout)
  const { error: e3 } = await db.rpc('set_ce_matches', { p_rows: [], p_reset: true });
  if (e3) throw new Error(`set_ce_matches (reset): ${e3.message}`);
  const rowsToMark = dolMatches.map(strip);
  for (let i = 0; i < rowsToMark.length; i += 500) {
    const { error } = await db.rpc('set_ce_matches', { p_rows: rowsToMark.slice(i, i + 500), p_reset: false });
    if (error) throw new Error(`set_ce_matches at ${i}: ${error.message}`);
    process.stdout.write(`\rDOL programs marked: ${Math.min(i + 500, rowsToMark.length)} / ${rowsToMark.length}`);
  }
  process.stdout.write('\n');
  // Course → credential links
  // Only the links this import makes; links made by name/acronym for CareerOneStop certifications
  // (match_method cos_name / cos_acronym, function cos_link_courses) are kept (2026-11-18)
  const { error: e4 } = await db.from('course_credentials').delete().in('match_method', ['issuer_name', 'state_license']);
  if (e4) throw new Error(`clear course_credentials: ${e4.message}`);
  await upsertAll('course_credentials', links, 'course_id,credential_id', 2000);
  // Licenses without an occupation code: match the license name to occupation titles (O*NET / BLS)
  // Starts with 50 per call and halves on a statement timeout
  let matched = 0; let checked = 0; let size = 50;
  for (;;) {
    const { data, error } = await db.rpc('match_credential_socs', { p_limit: size });
    if (error) {
      if (/timeout/i.test(error.message) && size > 5) { size = Math.floor(size / 2); continue; }
      throw new Error(`match_credential_socs: ${error.message}`);
    }
    if (!data?.checked) break;
    matched += data.matched; checked += data.checked;
    process.stdout.write(`\rlicense names checked: ${checked}, matched to an occupation: ${matched}`);
  }
  process.stdout.write('\n');
  console.log(`Done. ${oldCourses ?? 0} old courses and ${oldCreds ?? 0} old credentials removed. ${dolMatches.length} DOL programs marked as also listed by Credential Engine.`);
} catch (e) {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
}
