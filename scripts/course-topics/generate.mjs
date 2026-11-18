#!/usr/bin/env node
/**
 * Course topics per job (SOC) — run about once a year (Amit, 2026-10-28).
 *
 * For every occupation in the app, asks Claude which SHORT courses usually help
 * people in that job get hired, paid more or promoted (e.g. Nursing Assistants →
 * BLS CPR; Forklift operators → OSHA forklift certification). The app's AI course
 * search (suggest-course) then looks for these first, so a small, cheap model
 * finds better courses with fewer searches.
 *
 * Uses the Message Batches API (half price). ~830 jobs with Sonnet 4.5 ≈ $3–4.
 *
 * Output:
 *   scripts/course-topics/course-topics-<date>.json        — to read / review
 *   supabase/migrations/<timestamp>_course_topics_data.sql — apply with: npx supabase db push
 *
 * Run (PowerShell, in the app folder):
 *   $env:ANTHROPIC_API_KEY="sk-ant-..."
 *   node scripts/course-topics/generate.mjs                    all jobs (batch, usually 5–30 min)
 *   node scripts/course-topics/generate.mjs --socs 31-1131,53-7051 --direct   a few jobs, right away (to try it)
 *   Options: --model claude-sonnet-4-5 (default) · --limit N · --direct (no batch, full price)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const SUPABASE_URL = 'https://nebgfohbxsdcthvrlipm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_W5uhS6oxIAv4z_fXt485-g_Qd7Vhp26';   // the app's public key (occupations are public)
const API = 'https://api.anthropic.com/v1';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const MODEL = opt('model') ?? 'claude-sonnet-4-5';
const LIMIT = opt('limit') ? +opt('limit') : Infinity;
const ONLY = opt('socs')?.split(',').map((s) => s.trim()).filter(Boolean);
const DIRECT = args.includes('--direct');
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('Set ANTHROPIC_API_KEY first.'); process.exit(1); }
const headers = { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };

const SYSTEM = `You help US workers, mostly in hands-on, service and blue-collar jobs, find a quick, practical step forward.
For the occupation given, list the SHORT courses that people in this job commonly take to get hired, earn more, or be promoted.

A course qualifies only if:
- It is short: a few hours up to about 48 hours of class in total (one day, a weekend, a few evenings, or a short online course).
- It ends in a certificate, card or license that employers recognize — ideally from a national body (e.g. American Heart Association, American Red Cross, OSHA, NCCER, NHA, AMCA, PTCB, ServSafe, AWS welding, EPA 608, NATE) or a state-approved course.
- It is for newcomers to that credential (not a refresher, renewal or continuing-education course).
- It is a course on its own, not part of a degree or a long program, and not the long basic training that the job itself requires (e.g. not a 120-hour CNA program for a nursing assistant, not a full CDL program for a truck driver).
- It is genuinely common or valued for THIS job. Do not pad the list: fewer good items beat many weak ones. If nothing fits (e.g. jobs that need a degree), return [].

Order best first: required or most often asked for by employers first, then those linked to higher pay or promotion.
Reply with ONLY a JSON array (at most 5 items), no prose:
[{"name":"short plain name, e.g. BLS CPR","search":"a web search phrase to find a class, without a place, e.g. AHA BLS Provider class","credential":"certificate name or null","issuer":"who issues it or null","hours":typical total class hours as a number or null,"delivery":"online|in person|either","helps":"required|often asked for|higher pay|promotion"}]`;

const userMsg = (o) => `Occupation: ${o.title} (SOC ${o.soc})`;

async function occupations() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/occupations?select=soc,title&order=soc`, {
      headers: { apikey: SUPABASE_KEY, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`occupations: ${r.status} ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

function parseTopics(text) {
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try {
    const list = JSON.parse(text.slice(a, b + 1));
    if (!Array.isArray(list)) return null;
    // over ~48 hours is not a short course (e.g. the 75-hour basic training for the job itself) → dropped
    return list.filter((t) => t && typeof t.name === 'string' && t.name.trim() && !(typeof t.hours === 'number' && t.hours > 48)).slice(0, 5).map((t) => ({
      name: t.name.trim(),
      search: typeof t.search === 'string' && t.search.trim() ? t.search.trim() : t.name.trim(),
      credential: typeof t.credential === 'string' && t.credential.trim() && t.credential !== 'null' ? t.credential.trim() : null,
      issuer: typeof t.issuer === 'string' && t.issuer.trim() && t.issuer !== 'null' ? t.issuer.trim() : null,
      hours: typeof t.hours === 'number' && t.hours > 0 ? t.hours : null,
      delivery: ['online', 'in person', 'either'].includes(t.delivery) ? t.delivery : 'either',
      helps: typeof t.helps === 'string' ? t.helps : null,
    }));
  } catch { return null; }
}

const params = (o) => ({ model: MODEL, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: userMsg(o) }] });
const idOf = (soc) => `soc_${soc.replace(/[^A-Za-z0-9_-]/g, '_')}`;

async function runDirect(jobs) {
  const results = new Map();
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const o = jobs[i++];
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(`${API}/messages`, { method: 'POST', headers, body: JSON.stringify(params(o)) });
        if (r.ok) { const m = await r.json(); addUsage(m.usage); results.set(o.soc, m.content.filter((c) => c.type === 'text').map((c) => c.text).join('')); break; }
        if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1))); continue; }
        throw new Error(`${o.soc}: ${r.status} ${await r.text()}`);
      }
      process.stdout.write(`\r${results.size}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log();
  return results;
}

async function runBatch(jobs) {
  const r = await fetch(`${API}/messages/batches`, {
    method: 'POST', headers,
    body: JSON.stringify({ requests: jobs.map((o) => ({ custom_id: idOf(o.soc), params: params(o) })) }),
  });
  if (!r.ok) throw new Error(`batch: ${r.status} ${await r.text()}`);
  let batch = await r.json();
  console.log(`Batch ${batch.id} sent (${jobs.length} jobs). Waiting for it to finish…`);
  while (batch.processing_status !== 'ended') {
    await new Promise((ok) => setTimeout(ok, 30000));
    const s = await fetch(`${API}/messages/batches/${batch.id}`, { headers });
    batch = await s.json();
    const c = batch.request_counts ?? {};
    process.stdout.write(`\r  done ${(c.succeeded ?? 0) + (c.errored ?? 0)} / ${jobs.length}   `);
  }
  console.log();
  const res = await fetch(batch.results_url, { headers });
  const lines = (await res.text()).split('\n').filter(Boolean);
  const bySoc = new Map(jobs.map((o) => [idOf(o.soc), o.soc]));
  const results = new Map();
  for (const line of lines) {
    const x = JSON.parse(line);
    if (x.result?.type === 'succeeded') addUsage(x.result.message.usage);
    if (x.result?.type === 'succeeded') results.set(bySoc.get(x.custom_id), x.result.message.content.filter((c) => c.type === 'text').map((c) => c.text).join(''));
  }
  return results;
}

const used = { input: 0, output: 0 };
const addUsage = (u) => { used.input += u?.input_tokens ?? 0; used.output += u?.output_tokens ?? 0; };
const sql = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

(async () => {
  let jobs = await occupations();
  if (ONLY) jobs = jobs.filter((o) => ONLY.includes(o.soc));
  jobs = jobs.slice(0, LIMIT);
  if (!jobs.length) { console.error('No occupations found.'); process.exit(1); }
  console.log(`${jobs.length} jobs · model ${MODEL} · ${DIRECT ? 'direct' : 'batch'}`);

  const texts = DIRECT ? await runDirect(jobs) : await runBatch(jobs);
  const now = new Date();
  const out = [], failed = [];
  for (const o of jobs) {
    const topics = texts.has(o.soc) ? parseTopics(texts.get(o.soc)) : null;
    if (topics) out.push({ soc: o.soc, title: o.title, topics }); else failed.push(o.soc);
  }

  const day = now.toISOString().slice(0, 10);
  const jsonPath = resolve(here, `course-topics-${day}.json`);
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));

  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const migPath = resolve(root, 'supabase', 'migrations', `${stamp}_course_topics_data.sql`);
  mkdirSync(dirname(migPath), { recursive: true });
  const rows = out.map((x) => `(${sql(x.soc)}, ${sql(x.title)}, ${sql(JSON.stringify(x.topics))}::jsonb, ${sql(MODEL)}, ${sql(now.toISOString())})`);
  writeFileSync(migPath, `-- Course topics per job, made ${day} by scripts/course-topics/generate.mjs (${MODEL})\n` +
    (rows.length ? `insert into public.course_topics (soc, title, topics, model, generated_at) values\n${rows.join(',\n')}\n` +
      `on conflict (soc) do update set title = excluded.title, topics = excluded.topics, model = excluded.model, generated_at = excluded.generated_at;\n` : ''));

  const withTopics = out.filter((x) => x.topics.length).length;
  console.log(`\n${out.length} jobs done (${withTopics} with at least one course, ${out.length - withTopics} with none)${failed.length ? `; ${failed.length} failed: ${failed.slice(0, 20).join(', ')}${failed.length > 20 ? '…' : ''}` : ''}`);
  // List prices per million tokens (input/output); the batch service is half price
  const price = /haiku/i.test(MODEL) ? [1, 5] : /opus/i.test(MODEL) ? [5, 25] : [3, 15];
  const cost = (used.input * price[0] + used.output * price[1]) / 1e6 * (DIRECT ? 1 : 0.5);
  console.log(`Tokens: ${used.input.toLocaleString()} in, ${used.output.toLocaleString()} out · estimated cost $${cost.toFixed(2)}`);
  console.log(`Review: ${jsonPath}`);
  console.log(`Apply:  npx supabase db push   (${migPath})`);
})().catch((e) => { console.error(e); process.exit(1); });
