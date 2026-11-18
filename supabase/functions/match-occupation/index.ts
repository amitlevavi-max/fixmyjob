/**
 * match-occupation Edge Function
 *
 * When the word search can't place what the user typed ("nurse in an old
 * people's home", "enfermera en asilo", "I drive for DoorDash"), an AI reads it
 * and suggests up to 4 occupations — chosen ONLY from the official BLS list in
 * the `occupations` table. The app shows them as "Which is closest?"; the user
 * always picks. No numbers come from the AI.
 *
 * Body: { text: string }  →  { matches: [{ soc, title }] }
 * Deploy: supabase functions deploy match-occupation
 * Secrets: ANTHROPIC_API_KEY (required), MATCH_MODEL (optional, default claude-haiku-4-5)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logUsage } from '../_shared/usage.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// The official list, loaded once per function instance
let catalogue: Map<string, string> | null = null;
async function loadCatalogue() {
  if (catalogue) return catalogue;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const rows: Array<{ soc: string; title: string }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('occupations').select('soc, title').order('soc').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  catalogue = new Map(rows.map((r) => [r.soc, r.title]));
  return catalogue;
}

// Same question, same answer — no need to ask twice in one instance
const answers = new Map<string, Array<{ soc: string; title: string }>>();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'Server configuration error' }, 500);
    const { text } = await req.json();
    const q = typeof text === 'string' ? text.trim().slice(0, 200) : '';
    if (q.length < 2) return json({ matches: [] });
    const key = q.toLowerCase().replace(/\s+/g, ' ');
    if (answers.has(key)) return json({ matches: answers.get(key) });

    const list = await loadCatalogue();
    const lines = [...list.entries()].map(([soc, title]) => `${soc} ${title}`).join('\n');

    const system = `You map how a US worker describes their job to official occupations.
Pick up to 4 occupations from the LIST that the description could mean, most likely first.
If the words are ambiguous (e.g. "nurse" can mean a licensed practical nurse, a registered nurse or a nursing assistant), include each reasonable reading.
The description may be informal, misspelled or in another language.
Reply with ONLY a JSON array of SOC codes from the LIST, e.g. ["29-2061","31-1131"]. Reply [] if nothing fits.

LIST:
${lines}`;

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: Deno.env.get('MATCH_MODEL') ?? 'claude-haiku-4-5',
        max_tokens: 100,
        system,
        messages: [{ role: 'user', content: `Job description: "${q}"` }],
      }),
    });
    if (!ai.ok) {
      console.error('Anthropic error', ai.status, await ai.text());
      return json({ matches: [] });
    }
    const data = await ai.json();
    await logUsage('match-occupation', Deno.env.get('MATCH_MODEL') ?? 'claude-haiku-4-5', data);
    const out = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const codes = out.match(/\d{2}-\d{4}/g) ?? [];
    const seen = new Set<string>();
    const matches = codes
      .filter((c: string) => list.has(c) && !seen.has(c) && seen.add(c))
      .slice(0, 4)
      .map((soc: string) => ({ soc, title: list.get(soc)! }));
    answers.set(key, matches);
    return json({ matches });
  } catch (e) {
    console.error('match-occupation error', e);
    return json({ matches: [] });
  }
});
