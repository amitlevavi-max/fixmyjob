#!/usr/bin/env node
/**
 * Recommendations test tool — see README.md in this folder.
 *
 *   node scripts/recommendations/run.mjs examples/forklift-la.json        readable list
 *   node scripts/recommendations/run.mjs examples/forklift-la.json --json full JSON
 *   node scripts/recommendations/run.mjs examples/*.json                  several profiles
 *   node scripts/recommendations/run.mjs personas --csv results.csv       a whole folder → CSV (+ .json)
 *   node scripts/recommendations/run.mjs --serve [--port 8787]            HTTP: POST /recommendations
 *   … --out results.txt                                                   also save what's printed, as UTF-8 (use instead of > in PowerShell)
 *   … --llms [claude,chatgpt,gemini] [--no-web]                           also ask the LLMs, as a regular user would (billed)
 *
 * Each run bundles the app's current src/ code (esbuild, ~1 s), so the results
 * always follow the latest app logic.
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { format } from 'node:util';
import { askLLMs, printLLMs, parseProviderList, looksLikeProviderList, PROVIDERS } from './llms.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '.build', 'harness.mjs');

async function loadHarness() {
  mkdirSync(dirname(outFile), { recursive: true });
  await build({
    entryPoints: [resolve(here, 'harness.tsx')],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    jsx: 'automatic',
    packages: 'external',            // react, zustand, supabase-js… come from node_modules
    alias: {
      'expo-secure-store': resolve(here, 'shims/expo-secure-store.ts'),
      'expo-localization': resolve(here, 'shims/expo-localization.ts'),
    },
    define: { __DEV__: 'false' },
    logLevel: 'error',
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // RECS_FRESH_WEB=1 → the AI course search (suggest-course) skips its cache and searches again.
  // For comparing models only: every such call is billed (Amit, 2026-10-28).
  if (process.env.RECS_FRESH_WEB) {
    const { FunctionsClient } = await import('@supabase/functions-js');
    const invoke = FunctionsClient.prototype.invoke;
    FunctionsClient.prototype.invoke = function (name, opts = {}) {
      if (name === 'suggest-course' && opts.body && typeof opts.body === 'object') {
        opts = { ...opts, body: { ...opts.body, refresh: true } };
        process.stderr.write('[fresh web search] suggest-course\n');
      }
      return invoke.call(this, name, opts);
    };
  }
  // react-test-renderer prints a deprecation notice on every render — not useful here
  const err = console.error;
  console.error = (...a) => { if (!String(a[0] ?? '').includes('react-test-renderer is deprecated')) err(...a); };
  return import(pathToFileURL(outFile).href + `?t=${Date.now()}`);
}

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;

function printReadable(name, r) {
  const p = r.profile;
  console.log(`\n══ ${name} ${'═'.repeat(Math.max(0, 70 - name.length))}`);
  console.log(`Job:       ${p.occupation ? `${p.occupation.title} (${p.occupation.soc})` : `not listed — "${p.role}"`}  · ${p.occupationMatch}`);
  console.log(`Goals:     ${p.goals.join(', ')}`);
  console.log(`Pay:       ${money(p.annualPay)} a year · ${p.monthsInJob} months in the job`);
  console.log(`Location:  ${p.location ?? '— (not given)'}${p.zip ? ` · ZIP ${p.zip}` : ''}${p.employer ? ` · Employer: ${p.employer}` : ''}`);
  if (r.standing) {
    const sd = r.standing, lp = sd.localPay;
    console.log(`Rank:      earns more than ${sd.percentile} out of 100 in ${sd.place} · ${sd.scenario}` +
      ` · ${sd.gapToMedian < 0 ? `${money(-sd.gapToMedian)} below` : `${money(sd.gapToMedian)} above`} typical pay`);
    console.log(`           local pay: 10% earn less than ${money(lp.p10)} · typical ${money(lp.median)} · top 25% over ${money(lp.p75)} · top 10% over ${money(lp.p90)}  [${sd.source}]`);
  }
  if (r.minimumWageShortfall > 0) console.log(`⚠ Below the minimum wage by ${money(r.minimumWageShortfall)} a year`);
  if (!r.buckets.length) console.log('\n(no recommendations)');
  for (const b of r.buckets) {
    console.log(`\n▸ ${b.title.toUpperCase()} — ${b.sub}`);
    for (const o of b.items) {
      const gain = o.gainAmount > 0 ? `+${money(o.gainAmount)}/yr` : '—';
      const plan = o.status === 'in_plan' ? ' [in plan]' : '';
      console.log(`  ${gain.padStart(13)}  ${o.title}${plan}`);
      console.log(`  ${''.padStart(13)}  ${o.moveType ? o.moveType.toUpperCase().replace('_', ' ') + ' · ' : ''}${o.kind} · for your goals: ${o.forYourGoals.join(', ') || '—'} · id: ${o.id}${o.trainingNearby ? ` · training nearby: ${o.trainingNearby}` : ''}`);
      if (o.gain) console.log(`  ${''.padStart(13)}  ${o.gain}${o.source ? `  [${o.source}]` : ''}`);
      if (o.course) {
        const c = o.course, pad = ''.padStart(17);
        const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);
        console.log(`${pad}Course: ${c.name} · ${c.provider} (${c.from}${c.foundAt ? `, ${c.foundAt.slice(0, 10)}` : ''})`);
        console.log(`${pad}Where: ${c.format}${c.location ? ` · ${c.location}` : ''}${c.distanceMi != null ? ` · ${c.distanceMi} mi` : ''} · Length: ${c.length ?? '—'} · Price: ${c.price ?? '—'}${c.priceSource ? ` (from ${c.priceSource})` : ''}`);
        if (c.credential) console.log(`${pad}Credential: ${c.credential}`);
        console.log(`${pad}Contact: ${[c.url, c.phone, c.email].filter(Boolean).join(' · ') || '— (looked up on the course screen)'}`);
        if (c.results) console.log(`${pad}Results: finished ${c.results.finished ?? '—'} · completion ${pct(c.results.completionRate)} · working at 6 months ${pct(c.results.employed6mo)} · pay after ${c.results.yearlyPayAfter ? `$${Math.round(c.results.yearlyPayAfter).toLocaleString('en-US')}/yr` : '—'}${c.results.reported ? ` (reported ${c.results.reported.slice(0, 4)})` : ''}`);
        else console.log(`${pad}Results: none (not on the DOL list)`);
      }
    }
  }
  console.log(`\nPotential yearly boost: ${r.potentialBoost.total > 0 ? money(r.potentialBoost.total) : '—'}`);
  for (const part of r.potentialBoost.parts) console.log(`  ${money(part.amount).padStart(10)}  ${part.label}${part.note ? ` (${part.note})` : ''}`);
  if (r.meta.warning) console.log(`\n⚠ ${r.meta.warning}`);
  console.log(`(${r.meta.ms} ms)`);
}

function errorBody(e) {
  return { error: e.message, ...(e.extra ?? {}) };
}

async function serve(port, llmOpts) {
  const { getRecommendations, InputError } = await loadHarness();
  createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
      res.end(JSON.stringify(body, null, 2));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    if (req.method !== 'POST' || !req.url?.startsWith('/recommendations')) {
      return send(404, { error: 'POST a JSON profile to /recommendations' });
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const input = JSON.parse(raw || '{}');
      const r = await getRecommendations(input);
      // ?llms (all) or ?llms=claude,gemini — or start the server with --llms to always include them
      const q = new URL(req.url, 'http://x').searchParams;
      const opts = q.has('llms') ? { providers: parseProviderList(q.get('llms')), web: q.get('web') !== '0' } : llmOpts;
      send(200, opts ? { ...r, llms: await askLLMs(input, r, opts) } : r);
    } catch (e) {
      send(e instanceof SyntaxError || e instanceof InputError ? 400 : 500, errorBody(e));
    }
  }).listen(port, () => console.log(`Recommendations test server: POST http://localhost:${port}/recommendations`));
}

/** Profile files from the arguments; a folder means every .json in it (PowerShell doesn't expand *.json) */
function profileFiles(args) {
  const out = [];
  for (const a of args) {
    const path = existsSync(a) ? a : resolve(here, a);
    if (existsSync(path) && statSync(path).isDirectory()) {
      readdirSync(path).filter((f) => f.endsWith('.json')).sort().forEach((f) => out.push(join(path, f)));
    } else out.push(path);
  }
  return out;
}

const csvCell = (v) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per recommendation (and one per profile that failed) — opens in Excel */
function toCsv(rows) {
  const head = ['Profile', 'Persona', 'Goals', 'Occupation', 'SOC', 'Location', 'Annual pay', 'Months in job',
    'Earns more than (out of 100)', 'Local typical pay',
    'Potential yearly boost', 'Below minimum wage by', 'Bucket', 'Rank in bucket', 'Recommendation', 'Move type', 'Yearly gain ($)',
    'What the app says', 'Source', 'Kind', 'For your goals', 'All goals it helps', 'Training nearby', 'Status', 'Item id',
    'Course provider', 'Course format', 'Course location', 'Course length', 'Course price', 'Course credential', 'Course page', 'Course phone', 'Course email',
    'Course finished', 'Course completion', 'Course working at 6 months', 'Course pay after ($/yr)', 'Course found by', 'Error'];
  const lines = [head];
  for (const { file, input, r, error } of rows) {
    const p = r?.profile;
    const base = [file, input?.persona ?? '', p?.goals ?? [input?.goal, ...(input?.otherGoals ?? [])].filter(Boolean),
      p?.occupation?.title ?? (p ? `(not listed) ${p.role}` : input?.job ?? ''), p?.occupation?.soc ?? input?.soc ?? '',
      p?.location ?? '', p?.annualPay ?? input?.annualPay ?? '', p?.monthsInJob ?? '',
      r?.standing?.percentile ?? '', r?.standing?.localPay?.median ?? '',
      r ? r.potentialBoost.total : '', r?.minimumWageShortfall || ''];
    const blank = (n) => Array(n).fill('');
    if (error) { lines.push([...base, ...blank(13 + 14), error]); continue; }
    if (!r.buckets.length) { lines.push([...base, '(none)', ...blank(13 + 14)]); continue; }
    const courseCols = (c) => (c ? [c.provider, c.format, c.location ?? '', c.length ?? '', c.price ?? '', c.credential ?? '', c.url ?? '', c.phone ?? '', c.email ?? '',
      c.results?.finished ?? '', c.results?.completionRate != null ? `${Math.round(c.results.completionRate * 100)}%` : '',
      c.results?.employed6mo != null ? `${Math.round(c.results.employed6mo * 100)}%` : '', c.results?.yearlyPayAfter ? Math.round(c.results.yearlyPayAfter) : '', c.from] : blank(14));
    for (const b of r.buckets) b.items.forEach((o, i) => lines.push([...base, b.title, i + 1, o.title, o.moveType ?? '', o.gainAmount,
      o.gain, o.source ?? '', o.kind, o.forYourGoals, o.goals, o.trainingNearby ?? '', o.status, o.id, ...courseCols(o.course), r.meta.warning ?? '']));
  }
  return '\ufeff' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** One row per profile × LLM: the question, the answer, its sources — next to the app's results */
function toLlmCsv(rows) {
  const lines = [['Profile', 'Persona', 'Goal', 'Question asked', 'App: potential yearly boost', 'App: recommendations',
    'LLM', 'Model', 'Web search', 'Answer', 'Sources', 'Seconds', 'Error']];
  for (const { file, input, r } of rows) {
    if (!r?.llms) continue;
    const sd = r.standing;
    const rank = sd ? `Earns more than ${sd.percentile} out of 100 in ${sd.place}; typical pay ${money(sd.localPay.median)}\n` : '';
    const appList = rank + r.buckets.flatMap((b) => b.items.map((o) => `${o.title}${o.gainAmount > 0 ? ` (+${money(o.gainAmount)}/yr)` : ''}`)).join('\n');
    for (const a of r.llms.answers) lines.push([file, input?.persona ?? '', input?.goal ?? '', r.llms.prompt, r.potentialBoost.total || '', appList,
      a.label, a.model, a.web ? 'yes' : 'no', a.text, a.sources.map((s) => s.url).join('\n'), a.seconds, a.error ?? '']);
  }
  return '\ufeff' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

async function main() {
  const args = process.argv.slice(2);
  // --llms [claude,chatgpt,gemini]: also ask the LLMs the same question a user would (see llms.mjs)
  const li = args.indexOf('--llms');
  const llmList = li >= 0 && looksLikeProviderList(args[li + 1]) ? args[li + 1] : null;
  const llmOpts = li >= 0 ? { providers: parseProviderList(llmList), web: !args.includes('--no-web') } : null;
  if (llmOpts) {
    const missing = llmOpts.providers.filter((id) => !PROVIDERS[id].key()).map((id) => `${PROVIDERS[id].label} (${PROVIDERS[id].keyName})`);
    if (missing.length) console.error(`⚠ No API key for: ${missing.join(', ')} — skipped. Set it in PowerShell or in scripts/recommendations/.env.llm`);
  }
  if (args.includes('--serve')) {
    const i = args.indexOf('--port');
    return serve(i >= 0 ? Number(args[i + 1]) : 8787, llmOpts);
  }
  // --out file.txt: save everything printed, as UTF-8 — PowerShell's > saves UTF-16 and garbles the symbols
  const oi = args.indexOf('--out');
  const outTxt = oi >= 0 && args[oi + 1] && !args[oi + 1].startsWith('--') ? resolve(args[oi + 1]) : null;
  const printed = [];
  if (outTxt) {
    const log = console.log;
    console.log = (...a) => { printed.push(format(...a)); log(...a); };
  }
  const json = args.includes('--json');
  const ci = args.indexOf('--csv');
  const csvOut = ci >= 0 ? resolve(args[ci + 1] && !args[ci + 1].startsWith('--') ? args[ci + 1] : 'recommendations.csv') : null;
  const files = profileFiles(args.filter((a, i) => !a.startsWith('--') && !(ci >= 0 && i === ci + 1) && !(llmList && i === li + 1) && !(outTxt && i === oi + 1)));
  if (!files.length) {
    console.log('Usage: node scripts/recommendations/run.mjs <profile.json | folder> [more…] [--json] [--csv results.csv] [--llms [claude,chatgpt,gemini]] [--no-web] [--out results.txt]\n       node scripts/recommendations/run.mjs --serve [--port 8787]');
    process.exit(1);
  }
  const { getRecommendations } = await loadHarness();
  const results = [];
  const rows = [];
  let failed = false;
  for (const path of files) {
    const name = basename(path, '.json');
    let input = null;
    try {
      input = JSON.parse(readFileSync(path, 'utf8'));
      if (csvOut) console.log(`… ${name}`);
      const r = await getRecommendations(input);
      if (llmOpts) {
        if (csvOut) console.log(`  … asking ${llmOpts.providers.map((id) => PROVIDERS[id].label).join(', ')}`);
        r.llms = await askLLMs(input, r, llmOpts);
      }
      rows.push({ file: name, input, r });
      if (json) results.push({ file: name, ...r });
      else if (!csvOut) { printReadable(name, r); if (r.llms) printLLMs(r.llms); }
    } catch (e) {
      failed = true;
      rows.push({ file: name, input, error: e.message + (e.extra && Object.keys(e.extra).length ? ' ' + JSON.stringify(e.extra) : '') });
      if (json) results.push({ file: name, ...errorBody(e) });
      else console.log(`\n══ ${name}\n✗ ${e.message}${e.extra && Object.keys(e.extra).length ? '\n' + JSON.stringify(e.extra, null, 2) : ''}`);
    }
  }
  if (csvOut) {
    writeFileSync(csvOut, toCsv(rows), 'utf8');
    writeFileSync(csvOut.replace(/\.csv$/i, '') + '.json', JSON.stringify(rows.map(({ file, input, r, error }) => ({ file, input, ...(r ?? { error }) })), null, 2), 'utf8');
    if (llmOpts) {
      const llmCsv = csvOut.replace(/\.csv$/i, '') + '-llms.csv';
      writeFileSync(llmCsv, toLlmCsv(rows), 'utf8');
      console.log(`\nSaved the LLM answers to ${llmCsv}`);
    }
    console.log(`\nSaved ${csvOut} (and the full results as .json next to it)`);
  }
  if (json) console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  if (outTxt) {
    writeFileSync(outTxt, '\ufeff' + printed.join('\r\n') + '\r\n', 'utf8');   // BOM so Notepad and Excel read it as UTF-8
    process.stderr.write(`\nSaved the output to ${outTxt}\n`);
  }
  process.exit(failed ? 1 : 0);   // supabase-js keeps timers alive
}

main().catch((e) => { console.error(e); process.exit(1); });
