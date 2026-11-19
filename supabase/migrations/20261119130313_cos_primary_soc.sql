-- flagged_certifications(): the course's MAIN occupation (first SOC code) must be the user's job (2026-11-19).
-- Courses often list several occupations; the first one says what the course is for (short_courses() uses the same
-- rule). With "any listed occupation", nursing assistants got Certified Medical Assistant and Professional Coder, and
-- medical assistants lost CMA. Red Cross / American Heart Association safety courses keep the exception.
do $migration$
declare
  sig constant regprocedure := 'public.flagged_certifications(text, text, double precision, double precision, int, text[], int)'::regprocedure;
  old_expr constant text := $o$or p_soc = any(t.socs))$o$;
  new_expr constant text := $n$or t.socs[1] = p_soc)$n$;
  def text := pg_get_functiondef(sig);
begin
  if position(new_expr in def) > 0 then return; end if;
  if position(old_expr in def) = 0 then
    raise exception 'flagged_certifications(): occupation check not found';
  end if;
  execute replace(def, old_expr, new_expr);
end
$migration$;
grant execute on function public.flagged_certifications(text, text, double precision, double precision, int, text[], int)
  to anon, authenticated;
