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

    const { question, state, stateName, role } = await req.json();

    if (!question?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Question is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const locationContext = stateName
      ? `The user works in ${stateName} (${state}).`
      : 'The user has not specified their state — apply general US federal law.';

    const systemPrompt = `You are a US labor rights advisor helping blue-collar and gig workers understand their legal rights. Give clear, practical answers in plain English.

Context: ${locationContext}${role ? ` Their job: ${role}.` : ''}

Guidelines:
- Lead with the federal baseline, then note stronger state protections if relevant.
- Be specific and actionable.
- Keep your answer under 200 words.
- Do NOT give legal advice — suggest they contact their state labor board or an employment attorney for serious disputes.`;

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: question.trim() }],
      }),
    });

    if (!anthropicRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to get answer — please try again' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await anthropicRes.json();
    await logUsage('ask-rights', 'claude-haiku-4-5', data);
    const answer = data.content?.[0]?.text ?? 'No answer returned.';

    return new Response(
      JSON.stringify({ answer }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Unexpected error — please try again' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});