/**
 * Load each program's address and description (DOL DE103 / DE106) into
 * training_programs.address / .description — shown on the short-course item (2026-10-26).
 *
 * Input: Data/etp/program_details.json.gz = { "<program id>": [address, description], … }, made from
 * DownloadPrograms.xlsx by matching provider id + program name + state + weeks
 * to the programs already imported (66,837 of 69,787).
 *
 * Run from the project folder (PowerShell), after `npx supabase db push`:
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<secret key: Supabase → Project Settings → API>"
 *   node scripts/import-program-details.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
const file = process.argv[2] ?? 'Data/etp/program_details.json.gz';
const all = Object.entries(JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')));
console.log(`${all.length} programs with details in ${file}`);
const db = createClient(url, key, { auth: { persistSession: false } });
const BATCH = 1000;
let updated = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const { data, error } = await db.rpc('set_program_details', { p: Object.fromEntries(all.slice(i, i + BATCH)) });
  if (error) { console.error(`\nFailed at ${i}: ${error.message}`); process.exit(1); }
  updated += data ?? 0;
  process.stdout.write(`\r${Math.min(i + BATCH, all.length)} / ${all.length}`);
}
console.log(`\nDone: ${updated} programs updated.`);
