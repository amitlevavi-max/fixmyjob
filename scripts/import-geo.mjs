/**
 * Load ZIP-code and metro-area centre points (Census Gazetteer 2024) into
 * Supabase: zip_points and cbsa_points. Used to turn a user's ZIP into a map
 * point and their closest city.
 *
 * Input: data/etp/geo_points.json.gz (built from 2024_Gaz_zcta_national.zip and
 * 2024_Gaz_cbsa_national.zip). Run from the project folder (PowerShell):
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
 *   node scripts/import-geo.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }
const { zips, cbsas } = JSON.parse(gunzipSync(readFileSync(process.argv[2] ?? 'data/etp/geo_points.json.gz')).toString('utf8'));
const db = createClient(url, key, { auth: { persistSession: false } });

async function load(table, rows, conflict) {
  for (let i = 0; i < rows.length; i += 2000) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 2000), { onConflict: conflict });
    if (error) { console.error(`\n${table}: ${error.message}`); process.exit(1); }
    process.stdout.write(`\r${table}: ${Math.min(i + 2000, rows.length)} / ${rows.length}`);
  }
  console.log();
}
await load('cbsa_points', cbsas.map(([cbsa, name, city, state, is_metro, lat, lon]) => ({ cbsa, name, city, state, is_metro, lat, lon })), 'cbsa');
await load('zip_points', zips.map(([zip, lat, lon]) => ({ zip, lat, lon })), 'zip');
console.log('Done.');
