/**
 * "The competition": what a regular user would get by asking Claude, ChatGPT or Gemini directly.
 *
 * Only used with --llms (see README.md). For each profile it writes the question a worker would
 * type into a chat app — plain words, no app jargon — and sends it to each LLM with web search on
 * (the consumer apps search the web for questions like this).
 *
 * API keys come from the environment, or from scripts/recommendations/.env.llm (not in Git):
 *   ANTHROPIC_API_KEY · OPENAI_API_KEY · GEMINI_API_KEY (or GOOGLE_API_KEY)
 * Models can be changed with CLAUDE_MODEL · OPENAI_MODEL · GEMINI_MODEL.
 * Every call is billed to those accounts.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ── keys ──────────────────────────────────────────────────────────────────────
const envFile = resolve(here, '.env.llm');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export const PROVIDERS = {
  claude: {
    label: 'Claude',
    key: () => process.env.ANTHROPIC_API_KEY,
    keyName: 'ANTHROPIC_API_KEY',
    model: () => process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    ask: askClaude,
  },
  chatgpt: {
    label: 'ChatGPT',
    key: () => process.env.OPENAI_API_KEY,
    keyName: 'OPENAI_API_KEY',
    model: () => process.env.OPENAI_MODEL || 'gpt-5.4',
    ask: askOpenAI,
  },
  gemini: {
    label: 'Gemini',
    key: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    keyName: 'GEMINI_API_KEY',
    model: () => process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    ask: askGemini,
  },
};
const ALIASES = { claude: 'claude', anthropic: 'claude', chatgpt: 'chatgpt', openai: 'chatgpt', gpt: 'chatgpt', gemini: 'gemini', google: 'gemini' };

/** "claude,gemini" → ['claude', 'gemini']; empty → all three */
export function parseProviderList(s) {
  if (!s || s === true) return Object.keys(PROVIDERS);
  const out = [];
  for (const name of String(s).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
    const id = ALIASES[name];
    if (!id) throw new Error(`Unknown LLM "${name}" — use claude, chatgpt, gemini`);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
export const looksLikeProviderList = (s) => !!s && String(s).split(',').every((x) => ALIASES[x.trim().toLowerCase()]);

// ── the question ──────────────────────────────────────────────────────────────
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const QUESTION = {
  earn_more: 'What would you advise me to do to earn more?',
  rise_up: 'What would you advise me to do to get promoted and move up?',
  change_careers: "I'm thinking about changing careers. What would you advise me to do?",
  claim_rights: "I'm not sure I'm being paid and treated fairly at work. What would you advise me to do?",
  work_life_balance: 'What would you advise me to do to get a better work-life balance?',
  less_physical: 'What would you advise me to do to find work that is less physically hard on me?',
};

/** BLS titles are plural and formal ("Nursing Assistants") — make them sound like a person ("nursing assistant") */
function plainJob(title) {
  let t = title.split(',')[0].replace(/^(Miscellaneous|All Other|Other)\s+/i, '').trim();
  t = t.replace(/\b(\w+?)(ers|ors|ants|ents|ists|ians|ides|ains|ics|ses)\b/gi, (w, a, b) => a + b.replace(/s$/, ''));
  t = t.replace(/\bWorkers\b/gi, 'worker').replace(/\bDrivers\b/gi, 'driver').replace(/\bNurses\b/gi, 'nurse');
  return t.toLowerCase();
}

const a = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function tenure(months) {
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.round((months / 12) * 2) / 2;
  return `${years % 1 ? `${Math.floor(years)} and a half` : years} year${years === 1 ? '' : 's'}`;
}

/**
 * The question a regular user would ask, e.g.
 * "I am a nurse with 2 years of experience. I live in Atlanta, Georgia and I work at Grady Hospital.
 *  I earn $50,000 a year. What would you advise me to do to earn more?"
 * A profile can set its own: "llmPrompt": "…" (whole question) or "llmJob": "nurse" (how they'd name their job).
 */
export function buildPrompt(input, r) {
  if (input.llmPrompt) return input.llmPrompt;
  const p = r?.profile ?? {};
  const job = input.llmJob || (input.soc === 'none' ? input.job : null) || input.job || (p.occupation?.title ? plainJob(p.occupation.title) : p.role) || 'worker';
  const months = input.monthsInJob != null ? Math.round(input.monthsInJob) : Math.round(Number(input.yearsInJob) * 12);
  const st = input.location?.state ? String(input.location.state) : null;
  const stateName = st ? STATE_NAMES[st.toUpperCase()] ?? st : null;
  const city = input.location?.metro;
  const where = city && stateName ? `${city}, ${stateName}` : stateName ? (input.location?.rural ? `a rural area in ${stateName}` : stateName) : null;
  const pay = input.hourlyRate && input.rightsAnswers?.payUnit === 'hour'
    ? `$${Number(input.hourlyRate).toFixed(2)} an hour`
    : `$${Math.round(input.annualPay).toLocaleString('en-US')} a year`;

  const s = [`I am ${a(job)} ${job} with ${tenure(months)} of experience.`];
  if (where && input.employer) s.push(`I live in ${where} and I work at ${input.employer}.`);
  else if (where) s.push(`I live in ${where}.`);
  else if (input.employer) s.push(`I work at ${input.employer}.`);
  s.push(`I earn ${pay}.`);
  s.push(QUESTION[input.goal] ?? QUESTION.earn_more);
  return s.join(' ');
}

/** For the web-search tools: roughly where the user is (the consumer apps know this from the IP) */
function userLocation(input) {
  const st = input.location?.state ? String(input.location.state) : null;
  if (!st) return null;
  const region = STATE_NAMES[st.toUpperCase()] ?? st;
  return { city: input.location?.metro, region, country: 'US' };
}

// ── calls ─────────────────────────────────────────────────────────────────────
async function post(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json?.error?.message ?? text.slice(0, 300)}`);
  return json;
}

async function askClaude({ prompt, model, key, web, loc }) {
  const tools = web ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5,
    ...(loc && { user_location: { type: 'approximate', ...(loc.city && { city: loc.city }), region: loc.region, country: loc.country } }) }] : undefined;
  const j = await post('https://api.anthropic.com/v1/messages',
    { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    { model, max_tokens: 8000, messages: [{ role: 'user', content: prompt }], ...(tools && { tools }) });
  const text = j.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const sources = j.content.flatMap((b) => b.citations ?? []).map((c) => ({ title: c.title, url: c.url })).filter((c) => c.url);
  return { text, sources, model: j.model };
}

async function askOpenAI({ prompt, model, key, web, loc }) {
  const tools = web ? [{ type: 'web_search', ...(loc && { user_location: { type: 'approximate', ...(loc.city && { city: loc.city }), region: loc.region, country: loc.country } }) }] : undefined;
  const j = await post('https://api.openai.com/v1/responses',
    { authorization: `Bearer ${key}` },
    { model, input: prompt, ...(tools && { tools }) });
  const parts = (j.output ?? []).filter((o) => o.type === 'message').flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text');
  const text = parts.map((c) => c.text).join('');
  const sources = parts.flatMap((c) => c.annotations ?? []).filter((x) => x.type === 'url_citation').map((x) => ({ title: x.title, url: x.url }));
  return { text, sources, model: j.model };
}

async function askGemini({ prompt, model, key, web }) {
  const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { 'x-goog-api-key': key },
    { contents: [{ role: 'user', parts: [{ text: prompt }] }], ...(web && { tools: [{ google_search: {} }] }) });
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text && cand?.finishReason) throw new Error(`No answer (finishReason: ${cand.finishReason})`);
  const sources = (cand?.groundingMetadata?.groundingChunks ?? []).map((c) => c.web).filter(Boolean).map((w) => ({ title: w.title, url: w.uri }));
  return { text, sources, model: j.modelVersion ?? model };
}

const dedupe = (sources) => {
  const seen = new Set();
  return sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
};

/**
 * Ask each chosen LLM the profile's question (in parallel). Never throws: a failed or skipped
 * LLM comes back with `error`.
 * → { prompt, answers: [{ provider, label, model, web, text, sources, seconds, error? }] }
 */
export async function askLLMs(input, r, { providers = Object.keys(PROVIDERS), web = true } = {}) {
  const prompt = buildPrompt(input, r);
  const loc = userLocation(input);
  const answers = await Promise.all(providers.map(async (id) => {
    const p = PROVIDERS[id];
    const base = { provider: id, label: p.label, model: p.model(), web };
    const key = p.key();
    if (!key) return { ...base, text: '', sources: [], seconds: 0, error: `skipped — no ${p.keyName}` };
    const t0 = Date.now();
    try {
      const out = await p.ask({ prompt, model: p.model(), key, web, loc });
      return { ...base, model: out.model || base.model, text: out.text.trim(), sources: dedupe(out.sources), seconds: Math.round((Date.now() - t0) / 100) / 10 };
    } catch (e) {
      return { ...base, text: '', sources: [], seconds: Math.round((Date.now() - t0) / 100) / 10, error: String(e?.message ?? e) + (e?.cause ? ` (${e.cause.code ?? e.cause.message ?? e.cause})` : '') };
    }
  }));
  return { prompt, answers };
}

export function printLLMs(llm) {
  console.log(`\n▸ WHAT A REGULAR USER WOULD GET FROM AN LLM`);
  console.log(`  Question: "${llm.prompt}"`);
  for (const ans of llm.answers) {
    console.log(`\n  ── ${ans.label} (${ans.model}${ans.web ? ', web search on' : ''}${ans.seconds ? `, ${ans.seconds} s` : ''}) ${'─'.repeat(20)}`);
    if (ans.error) { console.log(`  ✗ ${ans.error}`); continue; }
    console.log(ans.text.split('\n').map((l) => `  ${l}`).join('\n'));
    if (ans.sources.length) {
      console.log(`\n  Sources:`);
      for (const s of ans.sources) console.log(`    - ${s.title ? `${s.title} — ` : ''}${s.url}`);
    }
  }
}
