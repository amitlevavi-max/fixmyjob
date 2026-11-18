/**
 * course-contact Edge Function (2026-10-26)
 *
 * How to reach the provider of one approved training program: website, the
 * program's own page, phone and email — found by a LIVE web search on the
 * provider's own site (Claude + web_search), never from the model's memory.
 * The DOL program list has no phone or email, and a web address for only
 * 75% of programs.
 *
 * Every detail is kept only with the page it was read on, and only if that
 * page came back from the search and still opens. Results are cached per
 * program for 90 days (course_contact_cache); an empty answer is not cached.
 *
 * Body: { programId: string, refresh?: boolean }
 * Reply: { contact: { website, program_url, phone, email, sources: { website?, program_url?, phone?, email? } }, foundAt, cached }
 * Deploy: npx supabase functions deploy course-contact
 * Secrets: ANTHROPIC_API_KEY (already set for find-courses), COURSE_MODEL (optional)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logUsage } from '../_shared/usage.ts';

const CACHE_DAYS = 90;
/** Web searches per call (was 4; Amit 2026-10-28: cost) — the prompt states it so the model answers when they run out */
const MAX_SEARCHES = 2;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'null' ? v.trim() : null);

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

/** US phone as (555) 123-4567; null when it doesn't look like one */
function phone(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = s.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : null;
}
const email = (v: unknown) => { const s = str(v); return s && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s) ? s.toLowerCase() : null; };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Server configuration error' }, 500);
    const body = await req.json();
    const programId = str(body.programId);
    if (!programId) return json({ error: 'programId is required' }, 400);

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    if (!body.refresh) {
      const since = new Date(Date.now() - CACHE_DAYS * 86400_000).toISOString();
      const { data: hit } = await db.from('course_contact_cache').select('contact, found_at').eq('program_id', programId).gte('found_at', since).maybeSingle();
      if (hit) return json({ contact: hit.contact, foundAt: hit.found_at, cached: true });
    }

    const { data: p } = await db.from('training_programs')
      .select('provider, name, credential, city, state, address, url').eq('id', programId).maybeSingle();
    if (!p) return json({ error: 'Unknown program' }, 404);

    const model = Deno.env.get('COURSE_MODEL') ?? 'claude-haiku-4-5';
    const where = p.address ?? [p.city, p.state].filter(Boolean).join(', ');
    const system = `You find official contact details for a training provider so a worker can enroll.
Use the web_search tool. Use ONLY pages you found with web_search in this conversation — never memory.
Provider: "${p.provider}" (${where}). Program: "${p.name}"${p.credential ? ` (leads to: ${p.credential})` : ''}.${p.url ? ` Known program page: ${p.url}` : ''}
Find, preferably on the provider's own website:
- website: the provider's home page
- program_url: the page for this program (or its enrollment / admissions page)
- phone: the phone number for this program, admissions or enrollment (else the main number)
- email: the email for this program, admissions or enrollment (else a general contact email)
For each value give the page you read it on. Use null for anything you did not see on a page.
Search budget: at most ${MAX_SEARCHES} web searches, and there is no next turn. When they are used up (or a search says the limit is reached), stop searching and answer with what you found. Never say you will search more later.
Reply with ONLY JSON, no prose:
{"website":"…","website_source":"…","program_url":"…","program_url_source":"…","phone":"…","phone_source":"…","email":"…","email_source":"…"}`;

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 1500, system,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES,
          user_location: { type: 'approximate', country: 'US', ...(p.city ? { city: p.city } : {}), ...(p.state ? { region: p.state } : {}) } }],
        messages: [{ role: 'user', content: `Contact details for "${p.name}" at ${p.provider}.` }],
      }),
    });
    if (!ai.ok) {
      console.error('Anthropic error', ai.status, await ai.text());
      return json({ error: 'Couldn\'t look up the contact details right now — please try again.' }, 502);
    }
    const data = await ai.json();
    await logUsage('course-contact', model, data, { programId });
    const blocks: any[] = data.content ?? [];
    const seen = new Set<string>();
    for (const b of blocks) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r?.url) seen.add(host(r.url));
    }
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const a = text.indexOf('{'), z = text.lastIndexOf('}');
    let raw: any = {};
    try { raw = a >= 0 && z > a ? JSON.parse(text.slice(a, z + 1)) : {}; } catch { raw = {}; }

    // A value counts only with a source page that came back from the search and still opens
    const okSource = async (src: string | null) => !!src && seen.has(host(src)) && await reachable(src);
    const contact: Record<string, any> = { website: null, program_url: null, phone: null, email: null, sources: {} };
    const tries: Array<[string, string | null, string | null]> = [
      ['website', str(raw.website), str(raw.website_source) ?? str(raw.website)],
      ['program_url', str(raw.program_url), str(raw.program_url_source) ?? str(raw.program_url)],
      ['phone', phone(raw.phone), str(raw.phone_source)],
      ['email', email(raw.email), str(raw.email_source)],
    ];
    await Promise.all(tries.map(async ([k, v, src]) => {
      if (!v) return;
      if ((k === 'website' || k === 'program_url') && !(await reachable(v))) return;
      if (!(await okSource(src))) return;
      contact[k] = v;
      contact.sources[k] = src;
    }));
    // The DOL record's own page, when the search found nothing better
    if (!contact.program_url && p.url && await reachable(p.url)) { contact.program_url = p.url; contact.sources.program_url = 'US Dept. of Labor training program list'; }

    const foundAt = new Date().toISOString();
    if (contact.website || contact.program_url || contact.phone || contact.email) {
      await db.from('course_contact_cache').upsert({ program_id: programId, contact, model, found_at: foundAt }, { onConflict: 'program_id' });
    }
    return json({ contact, foundAt, cached: false });
  } catch (err) {
    console.error('course-contact error:', err);
    return json({ error: 'Unexpected error — please try again' }, 500);
  }
});
