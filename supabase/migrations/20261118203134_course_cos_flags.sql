-- Courses carry the CareerOneStop flags of the credentials they prepare for (Amit, 2026-11-18).
-- short_courses() already returns leads_to = the credentials a course prepares for (course_credentials);
-- each leads_to item now also has:
--   in_demand          — the credential is tagged "In-Demand" on CareerOneStop
--   industry_endorsed  — the credential is tagged "IND" (third-party industry-endorsed)
--   cos_checked_at     — when the flags were last checked (credentials.cos_flags_updated_at)
-- The flags come from migration 20261118133740_cos_flags.sql / Edge Function refresh-cos-flags.
-- The app highlights such courses in the plan lists and explains the tag on the course card.
--
-- Only that one expression of the function changes, so the rest of short_courses() (rules, order)
-- stays exactly as in 20261112000000_credential_engine.sql. Stops with an error if the text isn't found.
-- Revert: run this file again with the two strings swapped.

do $migration$
declare
  sig constant regprocedure := 'public.short_courses(text[], text, text, double precision, double precision, int, text[], int)'::regprocedure;
  old_expr constant text := $o$jsonb_build_object('name', cr.name, 'issuer', cr.issuer, 'kind', cr.kind, 'finder_url', cr.ce_finder_url)$o$;
  new_expr constant text := $n$jsonb_build_object('name', cr.name, 'issuer', cr.issuer, 'kind', cr.kind, 'finder_url', cr.ce_finder_url, 'in_demand', coalesce(cr.cos_in_demand, false), 'industry_endorsed', coalesce(cr.cos_industry_endorsed, false), 'cos_checked_at', cr.cos_flags_updated_at)$n$;
  def text := pg_get_functiondef(sig);
begin
  if position(new_expr in def) > 0 then
    raise notice 'short_courses() already returns the CareerOneStop flags';
    return;
  end if;
  if position(old_expr in def) = 0 then
    raise exception 'short_courses(): leads_to expression not found — function changed since 20261112000000_credential_engine.sql';
  end if;
  execute replace(def, old_expr, new_expr);
end
$migration$;

grant execute on function public.short_courses(text[], text, text, double precision, double precision, int, text[], int) to anon, authenticated;
