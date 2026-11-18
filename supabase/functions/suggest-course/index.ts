/**
 * suggest-course Edge Function (Amit, 2026-10-26)
 *
 * Fallback for the short-course Quick win: used only when the DOL list of
 * approved training programs has no valid short course for the user. Claude
 * runs a LIVE web search (never memory) for a short course that would move
 * this person's career forward, with the same rules as the DOL-based ones:
 *   - online and under 30 hours in total, or in person within the user's
 *     driving distance (`maxMiles`, 10–100, default 10; Amit 2026-10-27) with
 *     6 meetings or fewer (about 48 hours at most);
 *   - recognized in the user's state, or a national certification;
 *   - a course on its own (not one part of a degree or longer program);
 *   - not the training for the job the user already has.
 * Every course must come from a page the search returned and that still opens;
 * a price, phone or email is kept only with the page it was read on.
 * Cached 30 days per job + place + next jobs; an empty answer is cached for 1 day
 * (Amit 2026-10-28: cost) — a new ZIP or driving distance is a new key, so it still retries at once.
 * At most 3 searches per call (was 8). Every call's token use goes to ai_usage_log.
 * Course topics (Amit 2026-10-28): the course_topics table lists, per job (SOC), the short courses
 * that usually help (made once a year by scripts/course-topics). The topics for the user's job and
 * promotions are given to the model to search for first, so a small model finds better courses.
 *
 * Body: { job, soc, goals: string[], pay, monthsInJob, credentialsHeld?: string[],
 *         location: { city?, state?, stateName?, zip? }, nextJobs?: [{ soc, title, kind }], maxMiles?, refresh? }
 * Reply: { courses: WebCourse[], searchedAt, cached }
 * Deploy: npx supabase functions deploy suggest-course
 * Secrets: ANTHROPIC_API_KEY (already set), SUGGEST_MODEL (optional, default claude-haiku-4-5; Amit 2026-10-28: cost)
 * The reply also carries `diagnostics` (how many courses the search proposed and why any were dropped).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logUsage } from '../_shared/usage.ts';

const CACHE_DAYS = 30;
/** "Nothing found" is kept for a day, so repeat views don't run a new search */
const EMPTY_CACHE_HOURS = 24;
/** Web searches per call (was 8; each one adds page text that is re-read at every step) */
const MAX_SEARCHES = 3;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\d*\./, ''); } catch { return ''; } };
/** Same site: "www2.college.edu", "careers.college.edu" and "college.edu" count as one */
const site = (u: string) => host(u).split('.').slice(-2).join('.');
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : typeof v === 'string' && isFinite(+v) && +v > 0 ? +v : null);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function reachable(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FixMyJob link check)' } });
    r.body?.cancel();
    return r.status < 400 || [401, 403, 405, 429].includes(r.status);
  } catch {
    return false;
  }
}
function phone(v: unknown): string | null {
  const s = str(v); if (!s) return null;
  const d = s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}
/** A course for people who already hold the credential (unless it is also for newcomers) */
const refresher = (t: string) => /\b(in-?service|refresher|renewal|re-?certif\w*|recert\w*|continuing (education|ed)|CEUs?)\b/i.test(t)
  && !/\b(initial|new|first[- ]time)\b/i.test(t);
/** Duration that is about how long a certificate lasts, not class time → null */
const classLength = (d: string | null) => (d && !/\b(valid|validity|expires?|expiration|renew\w*|good for)\b/i.test(d) && !/^\s*\d+\s*years?\b/i.test(d) ? d : null);
/** "4 hours" → 4, "2 days" → 16, "3 evenings of 3 hours" → 9; weeks alone can't be turned into hours → null */
function hoursFrom(d: string | null): number | null {
  if (!d) return null;
  const s = d.toLowerCase();
  const sessions = s.match(/(\d+(?:\.\d+)?)\s*(?:evenings?|sessions?|classes|meetings?|nights?)\s*(?:of|x|×)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  if (sessions) return +sessions[1] * +sessions[2];
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)?\s*(\d+(?:\.\d+)?)?\s*(?:hours?|hrs?)\b/);
  if (h) return +(h[2] ?? h[1]);
  const days = s.match(/(\d+(?:\.\d+)?)\s*(?:-|to|–)?\s*(\d+(?:\.\d+)?)?\s*(?:full\s+)?days?\b/);
  if (days) return +(days[2] ?? days[1]) * 8;
  if (/\b(one|a)\s+(full\s+)?day\b/.test(s)) return 8;
  return null;
}
const email = (v: unknown) => { const s = str(v); return s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase() : null; };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Server configuration error' }, 500);
    const b = await req.json();
    const job = str(b.job);
    if (!job) return json({ error: 'job is required' }, 400);
    const loc = b.location ?? {};
    const city = str(loc.city), state = str(loc.state), stateName = str(loc.stateName) ?? state, zip = str(loc.zip);
    const next: Array<{ soc?: string; title: string; kind?: string }> = Array.isArray(b.nextJobs)
      ? b.nextJobs.filter((x: any) => str(x?.title)).slice(0, 8) : [];
    const goals: string[] = Array.isArray(b.goals) ? b.goals.filter((g: any) => str(g)).slice(0, 6) : [];
    const held: string[] = Array.isArray(b.credentialsHeld) ? b.credentialsHeld.filter((g: any) => str(g)).slice(0, 6) : [];
    const months = num(b.monthsInJob), pay = num(b.pay);
    // How far the user will drive to an in-person class (asked in the app when nothing was found within 10 miles)
    const maxMiles = Math.round(Math.min(100, Math.max(10, num(b.maxMiles) ?? 10)));
    const place = city && state ? `${city}, ${state}${zip ? ` ${zip}` : ''}` : stateName ?? 'the United States';
    // v4 (2026-10-28): searches the course topics first; v3 (2026-10-27): + supervisor-job rule; v2: no refreshers, class length required — earlier answers are not reused
    // + driving distance (2026-10-27); 10 miles keeps the old key so cached answers stay valid
    const key = ['v4', str(b.soc) ?? norm(job), state ?? '', norm(zip ?? city ?? ''), next.map((x) => x.soc ?? norm(x.title)).sort().join(','),
      ...(maxMiles !== 10 ? [`${maxMiles}mi`] : [])].join('|');

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    if (!b.refresh) {
      const since = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString();
      const { data: hit } = await db.from('course_suggest_cache').select('results, searched_at').eq('key', key).gte('searched_at', since).maybeSingle();
      const emptyFresh = hit && Date.now() - new Date(hit.searched_at).getTime() < EMPTY_CACHE_HOURS * 3600_000;
      if (hit && ((Array.isArray(hit.results) && hit.results.length) || emptyFresh)) return json({ courses: hit.results ?? [], searchedAt: hit.searched_at, cached: true });
    }

    const model = Deno.env.get('SUGGEST_MODEL') ?? 'claude-haiku-4-5';
    // Courses that usually help this job and its promotions (course_topics), best first
    const promoNext = next.filter((x) => x.soc && /promotion/i.test(x.kind ?? '')).slice(0, 2);
    const topicSocs = [str(b.soc), ...promoNext.map((x) => x.soc!)].filter(Boolean) as string[];
    let topicLines: string[] = [];
    if (topicSocs.length) {
      const { data: rows } = await db.from('course_topics').select('soc, topics').in('soc', topicSocs);
      const bySoc = new Map<string, any[]>((rows ?? []).map((r: any) => [r.soc, Array.isArray(r.topics) ? r.topics : []]));
      const heldLow = held.map((h) => h.toLowerCase());
      const fmt = (t: any, forWhat: string) => `- ${t.name}${t.credential ? ` (${t.credential}${t.issuer ? `, ${t.issuer}` : ''})` : ''} — ${forWhat}; search for "${t.search ?? t.name}"`;
      const usable = (t: any) => t && str(t.name) && !heldLow.some((h) => h && String(t.name).toLowerCase().includes(h));
      topicLines = [
        ...(bySoc.get(str(b.soc) ?? '') ?? []).filter(usable).slice(0, 4).map((t: any) => fmt(t, 'for their current job')),
        ...promoNext.flatMap((x) => (bySoc.get(x.soc!) ?? []).filter(usable).slice(0, 1).map((t: any) => fmt(t, `toward a promotion to ${x.title}`))),
      ];
    }
    const who = [
      `Job: ${job}${b.soc ? ` (SOC ${b.soc})` : ''}${months ? `, ${months < 12 ? `${Math.round(months)} months` : `${Math.round(months / 12)} years`} in this job` : ''}.`,
      pay ? `Pay: about $${Math.round(pay / 1000)}k a year.` : '',
      goals.length ? `Goals: ${goals.join('; ')}.` : '',
      next.length ? `Possible next jobs: ${next.map((x) => `${x.title}${x.kind ? ` (${x.kind})` : ''}`).join('; ')}.` : '',
      held.length ? `Already holds: ${held.join('; ')}.` : '',
      `Lives and works near ${place}${stateName && stateName !== place ? ` (${stateName})` : ''}.`,
    ].filter(Boolean).join('\n');
    const system = `You help US blue-collar and service workers take one quick, practical step forward in their career.
Use the web_search tool to find 1 to 3 SHORT courses for this person:
${who}
${topicLines.length ? `\nCourses that usually help people in this job, best first. Look for these FIRST: your first search is for the first one or two near ${place} (or online); only look for other courses if none of these can be found.\n${topicLines.join('\n')}\n` : ''}

A course qualifies only if ALL of these are true:
- Length: online and under 30 hours in total (a few evenings or one weekend), OR in person within about ${maxMiles} miles of ${place} with 6 meetings or fewer (about 48 hours at most).
- It gives a certificate that is recognized in ${stateName ?? 'their state'} or nationally (national certifying bodies such as AHA, Red Cross, OSHA, NHA, AMCA, NCCER, PTCB, ServSafe are good). If it is a state-regulated credential, the course must be approved in ${stateName ?? 'their state'}.
- It is a course on its own — not one part or module of a degree, diploma or longer program.
- It is not the basic training for the job they already have${held.length ? ', and not something they already hold' : ''}.
- It is for newcomers — not an in-service, refresher, renewal, recertification or continuing-education course for people who already hold the credential (a class for both new and renewing students is fine).
- It clearly helps with their current job or one of the next jobs above (more pay, promotion, or a better job). Prefer courses for their current job or a promotion; a course for a career change only if nothing else fits.
- For a supervisor or lead job, the course must be about leading people (supervision, leadership, crew or team lead) or be in their own trade — never a course from another trade (e.g. no tile or plumbing course for an electrician).
Rules: use ONLY providers and pages found with web_search in this conversation — never memory. Copy price exactly as written on the page and give the page it is on; null if not seen.
"duration" is the CLASS TIME as written (e.g. "4 hours", "2 days", "3 evenings of 3 hours") — never how long the certificate stays valid. "hours" is the total class time in hours as a number. A course whose class time you can't find doesn't qualify. Phone and email only if seen on a page (give that page). Prefer national certifications, then the cheapest.
Search budget: you can run at most ${MAX_SEARCHES} web searches, and there is no next turn. Use them well: one search for courses near ${place} or online, then up to ${MAX_SEARCHES - 1} to check the best candidates (class length, price). When the searches are used up (or a search says the limit is reached), stop searching and answer with what you found — [] if nothing qualifies. Never say you will search more later.
Reply with ONLY a JSON array, no prose:
[{"name":"…","provider":"…","format":"online|in person|hybrid","location":"City, ST or Online","duration":"as written or null","hours":number or null,"price":"as written or null","price_source":"https://… or null","credential":"certificate name or null","why":"one plain sentence: how it helps this person","url":"https://… course page","phone":"… or null","phone_source":"https://… or null","email":"… or null","email_source":"https://… or null"}]`;

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 4000, system,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES,
          user_location: { type: 'approximate', country: 'US', ...(city ? { city } : {}), ...(state ? { region: state } : {}) } }],
        messages: [{ role: 'user', content: `Find a short course for a ${job} near ${place}.` }],
      }),
    });
    if (!ai.ok) {
      console.error('Anthropic error', ai.status, await ai.text());
      return json({ error: 'Couldn\'t search for courses right now — please try again.' }, 502);
    }
    const data = await ai.json();
    await logUsage('suggest-course', model, data, { key, maxMiles });
    const blocks: any[] = data.content ?? [];
    const seen = new Set<string>();
    for (const x of blocks) {
      if (x.type === 'web_search_tool_result' && Array.isArray(x.content)) for (const r of x.content) if (r?.url) seen.add(site(r.url));
    }
    const text = blocks.filter((x) => x.type === 'text').map((x) => x.text).join('\n');
    const s0 = text.indexOf('['), s1 = text.lastIndexOf(']');
    let raw: any[] = [];
    try { raw = s0 >= 0 && s1 > s0 ? JSON.parse(text.slice(s0, s1 + 1)) : []; } catch { raw = []; }
    if (!Array.isArray(raw)) raw = [];

    const fromSearch = async (u: string | null) => !!u && seen.has(site(u)) && await reachable(u);
    const dropped: string[] = [];
    const checked = await Promise.all(raw.slice(0, 5).map(async (c) => {
      const url = str(c.url);
      const label = `${str(c.name) ?? '?'} (${url ? host(url) : 'no link'})`;
      if (!url) { dropped.push(`${label}: no course page`); return null; }
      if (!seen.has(site(url))) { dropped.push(`${label}: site not in the search results`); return null; }
      if (!(await reachable(url))) { dropped.push(`${label}: page does not open`); return null; }
      const online = /online/i.test(String(c.format ?? '')) || /online/i.test(String(c.location ?? ''));
      if (refresher(`${c.name ?? ''} ${c.credential ?? ''}`)) { dropped.push(`${label}: for people who already hold the credential`); return null; }
      // Class time: a length about validity is not class time; without hours or a readable class length the rule can't be checked
      const duration = classLength(str(c.duration));
      const hours = num(c.hours) ?? hoursFrom(duration);
      if (hours == null) { dropped.push(`${label}: class length not found`); return null; }
      if (online ? hours >= 30 : hours > 48) { dropped.push(`${label}: ${hours} hours is too long`); return null; }
      const priceSource = str(c.price_source);
      const priceOk = !!str(c.price) && !!priceSource && (priceSource === url || await fromSearch(priceSource));
      const ph = phone(c.phone), phSrc = str(c.phone_source);
      const em = email(c.email), emSrc = str(c.email_source);
      return {
        name: str(c.name) ?? 'Course',
        provider: str(c.provider) ?? host(url),
        format: online ? 'online' : /hybrid/i.test(String(c.format ?? '')) ? 'hybrid' : 'in_person',
        location: str(c.location),
        duration,
        hours,
        price: priceOk ? str(c.price) : null,
        price_source: priceOk ? priceSource : null,
        credential: str(c.credential),
        why: str(c.why),
        url,
        phone: ph && (await fromSearch(phSrc)) ? ph : null,
        email: em && (await fromSearch(emSrc)) ? em : null,
        sources: {
          ...(priceOk ? { price: priceSource } : {}),
          ...(ph && phSrc ? { phone: phSrc } : {}),
          ...(em && emSrc ? { email: emSrc } : {}),
        },
      };
    }));
    const courses = checked.filter(Boolean).slice(0, 3);
    // a phone/email whose source failed the check was dropped above; drop its source too
    for (const c of courses as any[]) { if (!c.phone) delete c.sources.phone; if (!c.email) delete c.sources.email; }

    const searchedAt = new Date().toISOString();
    {
      // an empty answer is stored too, but only reused for EMPTY_CACHE_HOURS (see the cache read above)
      await db.from('course_suggest_cache').upsert({
        key, request: { job, soc: b.soc ?? null, state, city, zip, next: next.map((x) => x.title), goals }, results: courses, model, searched_at: searchedAt,
      }, { onConflict: 'key' });
    }
    const diagnostics = { proposed: raw.length, kept: courses.length, dropped, searches: blocks.filter((x) => x.type === 'server_tool_use').length,
      ...(raw.length ? {} : { reply: text.slice(0, 600) }) };
    if (!courses.length) console.log('suggest-course: nothing kept', JSON.stringify(diagnostics));
    return json({ courses, searchedAt, cached: false, diagnostics });
  } catch (err) {
    console.error('suggest-course error:', err);
    return json({ error: 'Unexpected error — please try again' }, 500);
  }
});
