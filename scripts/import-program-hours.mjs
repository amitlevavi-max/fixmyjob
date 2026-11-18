/**
 * Load program length in hours (DOL DE113, hours per week in practice) into
 * training_programs.hours_per_week — used by short_courses() (2026-10-26).
 *
 * Input: Data/etp/program_hours.json.gz = { "<program id>": hours, … }, made from
 * DownloadPrograms.xlsx by matching provider id + program name + state + weeks
 * to the programs already imported (49,669 of 69,787 have hours).
 *
 * Run from the project folder (PowerShell), after `npx supabase db push`:
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<secret key: Supabase → Project Settings → API>"
 *   node scripts/import-program-hours.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
const file = process.argv[2] ?? 'Data/etp/program_hours.json.gz';
const all = Object.entries(JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')));
console.log(`${all.length} programs with hours in ${file}`);
const db = createClient(url, key, { auth: { persistSession: false } });
const BATCH = 2000;
let updated = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const { data, error } = await db.rpc('set_program_hours', { p: Object.fromEntries(all.slice(i, i + BATCH)) });
  if (error) { console.error(`\nFailed at ${i}: ${error.message}`); process.exit(1); }
  updated += data ?? 0;
  process.stdout.write(`\r${Math.min(i + BATCH, all.length)} / ${all.length}`);
}
console.log(`\nDone: ${updated} programs updated.`);
