// Edge Function: request-account-deletion
// Called by the public web page /delete-account. Records the request in
// public.account_deletion_requests and (optionally) emails the team.
//
// Deploy:   npx supabase functions deploy request-account-deletion --no-verify-jwt
// Secrets:  npx supabase secrets set DELETION_NOTIFY_EMAIL=amitlevavi@gmail.com
//           npx supabase secrets set RESEND_API_KEY=re_...          (optional — no key = DB only)
//           npx supabase secrets set DELETION_IP_SALT=<random text>  (optional)
//           npx supabase secrets set ALLOWED_ORIGINS=https://fixmyjob.ai,https://www.fixmyjob.ai  (optional; default *)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const NOTIFY_EMAIL = Deno.env.get("DELETION_NOTIFY_EMAIL") ?? "amitlevavi@gmail.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Fix My Job <onboarding@resend.dev>";
const IP_SALT = Deno.env.get("DELETION_IP_SALT") ?? "fixmyjob-deletion";
const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);

const MAX_PER_IP_PER_HOUR = 5;
const REASONS = new Set([
  "", "not_useful", "privacy", "found_job", "too_many_questions", "other",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = ALLOWED.includes("*") ? "*" : (origin && ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400, origin);
  }

  // Honeypot: real people never fill the hidden "website" field. Pretend success.
  if (clean(body.website, 200)) return json({ ok: true }, 200, origin);

  const email = clean(body.email, 254).toLowerCase();
  const reason = clean(body.reason, 40);
  const comment = clean(body.comment, 1000);
  const scope = clean(body.scope, 20) === "data_only" ? "data_only" : "account";
  const confirmed = body.confirm === true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, error: "invalid_email" }, 400, origin);
  if (!REASONS.has(reason)) return json({ ok: false, error: "invalid_reason" }, 400, origin);
  if (!confirmed) return json({ ok: false, error: "not_confirmed" }, 400, origin);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Simple rate limit per IP (hashed, never stored raw).
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256(ip + IP_SALT);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("account_deletion_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) return json({ ok: false, error: "too_many_requests" }, 429, origin);

  // Link to an existing account if there is one. The response is the same either way,
  // so the page can't be used to find out who has an account.
  const { data: userId } = await supabase.rpc("lookup_user_id_by_email", { p_email: email });

  const { data: row, error } = await supabase
    .from("account_deletion_requests")
    .insert({
      email,
      reason: reason || null,
      comment: comment || null,
      delete_scope: scope,
      matched_user_id: userId ?? null,
      ip_hash: ipHash,
      user_agent: clean(req.headers.get("user-agent"), 300) || null,
    })
    .select("id, created_at")
    .single();

  if (error || !row) {
    console.error("insert failed", error);
    return json({ ok: false, error: "server_error" }, 500, origin);
  }

  // Optional notification email via Resend (https://resend.com). Failure never blocks the request.
  if (RESEND_API_KEY) {
    try {
      const html = `
        <h2>New account deletion request</h2>
        <p><b>Email:</b> ${escapeHtml(email)}<br>
        <b>Matches an account:</b> ${userId ? "yes (" + escapeHtml(String(userId)) + ")" : "no"}<br>
        <b>What to delete:</b> ${scope === "data_only" ? "Answers and plan only (keep sign-in)" : "Whole account and all data"}<br>
        <b>Reason:</b> ${escapeHtml(reason || "—")}<br>
        <b>Comment:</b> ${escapeHtml(comment || "—")}<br>
        <b>Request id:</b> ${row.id}<br>
        <b>Received:</b> ${row.created_at}</p>
        <p>Handle it in Supabase → table <code>account_deletion_requests</code>.</p>`;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [NOTIFY_EMAIL],
          subject: `Fix My Job: account deletion request (${email})`,
          html,
        }),
      });
      if (r.ok) {
        await supabase.from("account_deletion_requests").update({ email_sent: true }).eq("id", row.id);
      } else {
        console.error("resend failed", r.status, await r.text());
      }
    } catch (e) {
      console.error("resend error", e);
    }
  }

  return json({ ok: true, reference: String(row.id).slice(0, 8).toUpperCase() }, 200, origin);
});
