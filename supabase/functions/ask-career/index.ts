/**
 * ask-career Edge Function
 *
 * Two modes:
 *   A) targetRole omitted → LLM suggests best next role + typical tenure in current role
 *   B) targetRole provided → skills/certs/timeline for that specific transition
 *
 * Deploy: supabase functions deploy ask-career
 * Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

import { logUsage } from '../_shared/usage.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { currentRole, targetRole } = body;

    if (!currentRole) {
      return new Response(
        JSON.stringify({ error: 'currentRole is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let systemPrompt: string;
    let userMessage: string;

    if (!targetRole) {
      // Mode A: suggest the best next role + typical tenure
      systemPrompt = `You are a US career advisor specializing in blue-collar and service-industry workers. Identify the single most natural and achievable next career step for a worker, and how long they typically spend in their current role before reaching it.

Respond with ONLY a valid JSON object, no prose, no markdown, no code fences:
{
  "suggestedRole": "Job Title Here",
  "typicalTenureYears": { "min": 2, "max": 5 },
  "tenureNote": "One sentence on what drives the range.",
  "skills": ["skill 1", "skill 2"],
  "certifications": ["cert 1"],
  "timelineMonths": { "min": 6, "max": 18 },
  "timelineNote": "One sentence explaining transition timeline."
}

Rules:
- suggestedRole: the single most logical next step UP in the same industry/field. Not lateral, not a different field.
- typicalTenureYears: how long most workers stay in the CURRENT role before being ready for suggestedRole, based on industry norms.
- tenureNote: under 20 words explaining the range.
- skills: 6-10 practical skills needed to reach the suggested role.
- certifications: 2-5 real US certifications that help. Empty array if none required.
- timelineMonths: how long the active transition takes once the worker pursues it.
- timelineNote: under 20 words on what drives that range.`;

      userMessage = `Current role: ${currentRole}\n\nWhat is the single most natural next career step for a ${currentRole}? Return only JSON.`;

    } else {
      // Mode B: skills/certs for a known target (used by SkillsCerts screen)
      systemPrompt = `You are a US career advisor specializing in blue-collar and service-industry workers. Identify the practical skills, certifications, and realistic timelines for career advancement.

Respond with ONLY a valid JSON object, no prose, no markdown, no code fences:
{
  "skills": ["skill 1", "skill 2"],
  "certifications": ["cert 1"],
  "timelineMonths": { "min": 6, "max": 18 },
  "timelineNote": "One sentence explaining the range"
}

Rules:
- skills: 6-10 practical on-the-job skills needed for the target role. Short phrases, max 5 words each.
- certifications: 2-6 real US certifications (OSHA 10, ServSafe, CPR/AED, etc.). Empty array if none required.
- timelineMonths: realistic range in months assuming active effort.
- timelineNote: one concise sentence under 20 words.`;

      userMessage = `Current role: ${currentRole}\nTarget role: ${targetRole}\n\nWhat skills and certifications are needed to advance from ${currentRole} to ${targetRole}? Return only JSON.`;
    }

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error status:', anthropicRes.status, 'body:', errText);
      return new Response(
        JSON.stringify({ error: 'Anthropic error: ' + anthropicRes.status + ' ' + errText.slice(0, 120) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicData = await anthropicRes.json();
    await logUsage('ask-career', 'claude-haiku-4-5', anthropicData);
    const rawText = anthropicData.content?.[0]?.text ?? '';

    let parsed: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw:', rawText);
      return new Response(
        JSON.stringify({ error: 'Could not parse career data — please try again' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('ask-career error:', err);
    return new Response(
      JSON.stringify({ error: 'Unexpected error — please try again' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
