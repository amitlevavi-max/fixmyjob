/**
 * find-courses Edge Function
 *
 * Course providers near the user for one course/certification, found by a
 * LIVE web search (Claude + web_search tool) — not from the model's memory.
 * Every provider must come from a page the search returned; links are checked
 * before they're shown; a price is kept only with the page it came from.
 *
 * Results are cached per course + area for 30 days (course_search_cache), so
 * the same search in the same city is instant and costs nothing.
 *
 * Body: { courseKeyword: string, area: { label: 'Tyler, TX', city?: 'Tyler', state?: 'TX' }, refresh?: boolean }
 *       (old shape { courseKeyword, stateName, metro } still works)
 * Deploy: supabase functions deploy find-courses
 * Secrets: ANTHROPIC_API_KEY (required), COURSE_MODEL (optional, default claude-haiku-4-5)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logUsage } from '../_shared/usage.ts';

const CACHE_DAYS = 30;
/** Web searches per call (was 6; Amit 2026-10-28: cost) — the prompt states it so the model answers when they run out */
const MAX_SEARCHES = 3;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export interface CourseResult {
  name: string;
  provider: string;
  location: string;            // 'Tyler, TX' | 'Online'
  price: string | null;        // as written on the page, e.g. '$4,295'
  priceSource: string | null;  // page the price is on
  duration: string | null;     // as written, e.g. '4 weeks'
  url: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Does the page exist? (Some sites block robots with 401/403/405/429 — the page is still there.) */
async function reachable(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const r = await fetch(url, {
      method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FixMyJob link check)' },
    });
    r.body?.cancel();
    return r.status < 400 || [401, 403, 405, 429].includes(r.status);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Server configuration error' }, 500);

    const body = await req.json();
    const course = str(body.courseKeyword);
    if (!course) return json({ error: 'courseKeyword is required' }, 400);
    const area = body.area ?? {};
    const city = str(area.city) ?? str(body.metro);
    const state = str(area.state) ?? str(body.stateName);
    const label = str(area.label) ?? ([city, state].filter(Boolean).join(', ') || 'the United States');
    const key = `${norm(course)}|${norm(label)}`;

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    // ── Cache ────────────────────────────────────────────────────────────
    if (!body.refresh) {
      const since = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString();
      const { data: hit } = await db.from('course_search_cache')
        .select('results, searched_at, area_label').eq('key', key).gte('searched_at', since).maybeSingle();
      if (hit) return json({ courses: hit.results, searchedAt: hit.searched_at, area: hit.area_label, cached: true });
    }

    // ── Live web search ──────────────────────────────────────────────────
    const model = Deno.env.get('COURSE_MODEL') ?? 'claude-haiku-4-5';
    const system = `You help blue-collar and gig workers in the US find real training near them.
Use the web_search tool to find where someone near ${label} can train for: "${course}".

Rules:
- Use ONLY providers and pages you found with web_search in this conversation. Never answer from memory.
- Prefer in-person providers within about 50 miles of ${label}; add at most 2 online options.
- price: copy the price exactly as written on the page (e.g. "$4,295", "Free"), with the URL of that page in price_source. If you did not see a price, use null.
- duration: as written on the page, or null.
- url: the provider's page for this course.
- Up to 6 results, cheapest known price first.
- Search budget: at most ${MAX_SEARCHES} web searches, and there is no next turn. When they are used up (or a search says the limit is reached), stop searching and answer with what you found — [] if nothing. Never say you will search more later.

After searching, reply with ONLY a JSON array, no prose:
[{"name":"…","provider":"…","location":"City, ST or Online","price":"$… or null","price_source":"https://… or null","duration":"… or null","url":"https://…"}]`;

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        system,
        tools: [{
          type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES,
          user_location: { type: 'approximate', country: 'US', ...(city ? { city } : {}), ...(state ? { region: state } : {}) },
        }],
        messages: [{ role: 'user', content: `Find training for "${course}" near ${label}.` }],
      }),
    });
    if (!ai.ok) {
      console.error('Anthropic error', ai.status, await ai.text());
      return json({ error: 'Couldn\'t search for courses right now — please try again.' }, 502);
    }
    const data = await ai.json();
    await logUsage('find-courses', model, data);
    const blocks: any[] = data.content ?? [];

    // Every page the search actually returned — results must come from these sites
    const seen = new Set<string>();
    for (const b of blocks) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r?.url) seen.add(host(r.url));
      }
    }
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const start = text.indexOf('['), end = text.lastIndexOf(']');
    let raw: any[] = [];
    try { raw = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : []; } catch { raw = []; }
    if (!Array.isArray(raw)) raw = [];

    const candidates = raw.slice(0, 8).map((c) => ({
      name: str(c.name) ?? 'Course',
      provider: str(c.provider) ?? '',
      location: str(c.location) ?? '',
      price: str(c.price),
      priceSource: str(c.price_source),
      duration: str(c.duration),
      url: str(c.url) ?? '',
    })).filter((c) => c.url && seen.has(host(c.url)));

    // Check links; drop a price whose page can't be opened or wasn't in the search
    const checked = await Promise.all(candidates.map(async (c) => {
      if (!(await reachable(c.url))) return null;
      let { price, priceSource } = c;
      if (price && (!priceSource || !seen.has(host(priceSource)) ||
          (priceSource !== c.url && !(await reachable(priceSource))))) {
        price = null; priceSource = null;
      }
      if (!price) priceSource = null;
      return { ...c, price, priceSource } as CourseResult;
    }));
    const courses = checked.filter(Boolean).slice(0, 6) as CourseResult[];

    const searchedAt = new Date().toISOString();
    // Don't remember an empty answer — it may be a one-off search failure
    if (courses.length) await db.from('course_search_cache').upsert(
      { key, course, area_label: label, results: courses, model, searched_at: searchedAt },
      { onConflict: 'key' },
    );
    return json({ courses, searchedAt, area: label, cached: false });
  } catch (err) {
    console.error('find-courses error:', err);
    return json({ error: 'Unexpected error — please try again' }, 500);
  }
});
