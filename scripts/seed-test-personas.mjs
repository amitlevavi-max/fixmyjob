/**
 * Create (or refresh) the 10 Fix My Job test personas — see the project doc
 * claude/test-personas.md. Each gets a confirmed email/password account and a
 * filled-in profile, so signing in lands straight on "Where I stand".
 *
 * Safe to run again: existing accounts are updated, not duplicated.
 * Run from the project folder (PowerShell):
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
 *   node scripts/seed-test-personas.mjs            # create / update
 *   node scripts/seed-test-personas.mjs --delete   # remove all 10 test users
 */
import { createClient } from '@supabase/supabase-js';

const PASSWORD = 'abc12345';
// [first, last, SOC, goal, state abbr, state name, metro, ZIP, years in job, months (if < 5 yrs), yearly pay]
const PERSONAS = [
  ['Derek',   'Reed',     '31-1120', 'claim_rights', 'CT', 'Connecticut', 'Hartford',     '06106', 7, null, 32200],   // was 38,700 — below the CT minimum on purpose (2026-10-21)
  ['Carlos',  'Brooks',   '53-7062', 'earn_more',    'NY', 'New York',    'Buffalo',      '14201', 3, 36,   35400],
  ['Jenna',   'Johnson',  '53-7065', 'earn_more',    'MI', 'Michigan',    'Grand Rapids', '49503', 4, 48,   35100],
  ['Dale',    'Davis',    '37-2011', 'earn_more',    'MD', 'Maryland',    'Baltimore',    '21201', 2, 30,   34200],
  ['Tanya',   'Fisher',   '53-3032', 'rise_up',      'OR', 'Oregon',      'Salem',        '97301', 3, 36,   55500],
  ['Andre',   'Torres',   '49-9071', 'rise_up',      'WI', 'Wisconsin',   'Milwaukee',    '53202', 0, 8,    40900],
  ['Luis',    'Hayes',    '31-1131', 'earn_more',    'TN', 'Tennessee',   'Memphis',      '38103', 1, 18,   35600],
  ['Yolanda', 'Coleman',  '51-2090', 'rise_up',      'KY', 'Kentucky',    'Louisville',   '40202', 6, null, 40700],
  ['Shawna',  'Garcia',   '47-2061', 'claim_rights', 'OK', 'Oklahoma',    'Tulsa',        '74103', 1, 15,   33900],
  ['Marcus',  'Ramirez',  '53-3033', 'claim_rights', 'IA', 'Iowa',        'Des Moines',   '50309', 4, 48,   34500],
];

/**
 * Claim my rights personas (2026-10-21): their onboarding answers only — the
 * follow-up answers (overtime pay, contractor questions…) are for the tester
 * to give in the app (see the test-personas PDF, page 2).
 * hourly = base rate entered on the pay-type screen (null = not given).
 */
const SCHEDULE = (hours) => ({ hoursPerWeek: hours, daysPerWeek: 5, weekendHoursPerWeek: 0, overtimeMultiplier: 1.5, weekendPremiumPct: 0 });
const RIGHTS = {
  Derek:  { hourly: 15.48, hours: 40, answers: { payUnit: 'hour', workType: 'w2',   shifts: ['weekends', 'split'], concerns: ['unpaidHours'] } },
  Shawna: { hourly: null,  hours: 50, answers: { payUnit: 'hour', workType: 'w2',   shifts: ['over8', 'weekends'], concerns: ['noOvertime'] } },
  Marcus: { hourly: null,  hours: 45, answers: { payUnit: 'job',  workType: '1099', shifts: ['over8'],             concerns: ['misclassified'] } },
};

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const emailOf = (first) => `${first.toLowerCase()}@fixmyjob.com`;

// All existing accounts, by email
async function existingUsers() {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => u.email && byEmail.set(u.email.toLowerCase(), u));
    if (data.users.length < 1000) return byEmail;
  }
}

const users = await existingUsers();

if (process.argv.includes('--delete')) {
  for (const [first] of PERSONAS) {
    const u = users.get(emailOf(first));
    if (!u) { console.log(`- ${emailOf(first)}: not found`); continue; }
    await db.from('user_profiles').delete().eq('id', u.id);
    const { error } = await db.auth.admin.deleteUser(u.id);
    console.log(error ? `✗ ${emailOf(first)}: ${error.message}` : `✓ deleted ${emailOf(first)}`);
  }
  process.exit(0);
}

// Official titles (role) and ZIP points, checked before anything is written
const socs = [...new Set(PERSONAS.map((p) => p[2]))];
const { data: occs, error: occErr } = await db.from('occupations').select('soc,title').in('soc', socs);
if (occErr) throw occErr;
const titleOf = new Map(occs.map((o) => [o.soc, o.title]));
const missing = socs.filter((s) => !titleOf.has(s));
if (missing.length) { console.error(`Occupations not in the catalogue: ${missing.join(', ')} — nothing written.`); process.exit(1); }
const { data: zips } = await db.from('zip_points').select('zip,lat,lon').in('zip', PERSONAS.map((p) => p[7]));
const zipOf = new Map((zips ?? []).map((z) => [z.zip, z]));

let failed = 0;
for (const [first, last, soc, goal, st, stName, metro, zip, years, months, pay] of PERSONAS) {
  const email = emailOf(first);
  try {
    let id = users.get(email)?.id;
    const attrs = { password: PASSWORD, email_confirm: true, user_metadata: { full_name: `${first} ${last}`, test_persona: true } };
    if (id) {
      const { error } = await db.auth.admin.updateUserById(id, attrs);
      if (error) throw error;
    } else {
      const { data, error } = await db.auth.admin.createUser({ email, ...attrs });
      if (error) throw error;
      id = data.user.id;
    }
    const z = zipOf.get(zip);
    const now = new Date().toISOString();
    const { error } = await db.from('user_profiles').upsert({
      id,
      goal,
      goals: [{ id: goal, importance: 1, addedAt: now, satisfaction: null }],
      satisfaction: null,
      role: titleOf.get(soc),
      occupation_soc: soc,
      years_experience: years,
      tenure_months: months,
      annual_earnings: pay,
      location: `${metro}, ${st}`,
      location_state: st,
      location_state_name: stName,
      location_is_metro: true,
      location_metro: metro,
      ...(z && { home_zip: zip, home_lat: z.lat, home_lon: z.lon, home_city: `${metro}, ${st}` }),
      language: 'en',
      // Claim my rights personas: hours and hourly rate; everyone else back to defaults
      hourly_rate: RIGHTS[first]?.hourly ?? null,
      work_schedule: RIGHTS[first] ? SCHEDULE(RIGHTS[first].hours) : null,
      updated_at: now,
    }, { onConflict: 'id' });
    if (error) throw error;
    // Rights answers live in their own table (migration 20261021000000_claim_rights.sql)
    const r = RIGHTS[first];
    const { error: rErr } = r
      ? await db.from('worker_rights_answers').upsert({
          user_id: id,
          answers: { ...r.answers, scheduleAsked: ['hoursPerWeek'], answeredAt: now },
          updated_at: now,
        }, { onConflict: 'user_id' })
      : await db.from('worker_rights_answers').delete().eq('user_id', id);
    if (rErr) console.log(`  ! ${email}: rights answers not saved (${rErr.message}) — push the 2026-10-21 migration first`);
    console.log(`✓ ${email}  ${titleOf.get(soc)} · ${goal} · ${metro}, ${st} · $${pay}${z ? '' : '  (ZIP not found, left empty)'}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${email}: ${e.message}`);
  }
}
console.log(failed ? `\n${failed} failed.` : `\nAll ${PERSONAS.length} test users ready — password ${PASSWORD}.`);
