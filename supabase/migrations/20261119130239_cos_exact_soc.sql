-- flagged_certifications(): the course must list the user's exact occupation (2026-11-19).
-- Checking only the occupation group (first two SOC digits) let unrelated certifications through, because
-- CareerOneStop's occupation lists are noisy and healthcare jobs share groups 29/31: EMTs and pharmacy technicians got
-- Certified Dietary Manager and medical coding, HVAC technicians got CompTIA A+, nursing assistants got Dental Assistant.
-- Now a course counts only when its own occupation codes (DOL / Credential Engine) include the user's job.
-- General safety certifications (American Red Cross, American Heart Association: CPR, First Aid, BLS) keep the exception.
do $migration$
declare
  sig constant regprocedure := 'public.flagged_certifications(text, text, double precision, double precision, int, text[], int)'::regprocedure;
  old_expr constant text := $o$or exists (select 1 from unnest(t.socs) s where left(s, 2) = left(p_soc, 2)))$o$;
  new_expr constant text := $n$or p_soc = any(t.socs))                                        -- the course is for the user's job$n$;
  def text := pg_get_functiondef(sig);
begin
  if position('the course is for the user''s job' in def) > 0 then return; end if;
  if position(old_expr in def) = 0 then
    raise exception 'flagged_certifications(): occupation check not found';
  end if;
  execute replace(def, old_expr, new_expr);
end
$migration$;
grant execute on function public.flagged_certifications(text, text, double precision, double precision, int, text[], int)
  to anon, authenticated;
