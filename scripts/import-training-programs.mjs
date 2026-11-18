/**
 * Load the DOL training-program results (ETA-9171) into Supabase.
 *
 * Input: data/etp/etp_programs.json.gz — cleaned from DOL's DownloadPrograms.xlsx
 * (duplicates removed, suppressed -1 values → null, Excel-garbled SOC codes
 * repaired, lengths over 3 years dropped as misreported).
 *
 * Run from the project folder (PowerShell):
 *   $env:SUPABASE_URL="https://nebgfohbxsdcthvrlipm.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role key: Supabase → Project Settings → API>"
 *   node scripts/import-training-programs.mjs
 *
 * Safe to re-run: rows are upserted by id; DOL rows not in the file are removed
 * (Credential Engine rows, source = 'credential_engine', are left alone).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).');
  process.exit(1);
}
const file = process.argv[2] ?? 'data/etp/etp_programs.json.gz';
const rows = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
console.log(`${rows.length} programs in ${file}`);

const db = createClient(url, key, { auth: { persistSession: false } });
const importedAt = new Date().toISOString();
const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, imported_at: importedAt }));
  const { error } = await db.from('training_programs').upsert(batch, { onConflict: 'id' });
  if (error) { console.error(`\nBatch at ${i} failed: ${error.message}`); process.exit(1); }
  process.stdout.write(`\r${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}
// Only DOL rows: Credential Engine courses in the same table are managed by import-credential-engine.mjs
const { error: delErr, count } = await db.from('training_programs')
  .delete({ count: 'exact' }).eq('source', 'dol').lt('imported_at', importedAt);
if (delErr) console.error(`\nCleanup failed: ${delErr.message}`);
console.log(`\nDone. ${count ?? 0} old rows removed.`);
