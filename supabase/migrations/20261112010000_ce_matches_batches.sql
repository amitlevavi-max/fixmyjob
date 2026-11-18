-- ─────────────────────────────────────────────────────────────────────────────
-- set_ce_matches in batches (2026-11-12): marking all 5,412 DOL programs in one call
-- hit Supabase's statement timeout. The import script now clears the old marks with
-- one call (p_reset = true, no rows) and then sends the matches 500 at a time.
--
-- Revert: drop function public.set_ce_matches(jsonb, boolean);
--         re-run set_ce_matches from 20261112000000_credential_engine.sql
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.set_ce_matches(jsonb);

create or replace function public.set_ce_matches(p_rows jsonb, p_reset boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  if p_reset then
    update training_programs set ce_ctid = null, ce_finder_url = null, ce_updated_at = null
     where ce_ctid is not null and source = 'dol';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 0 then
    create temp table if not exists _ce_match (id text primary key, ce_ctid text, ce_finder_url text, ce_updated_at date) on commit drop;
    insert into _ce_match
      select x->>'id', x->>'ce_ctid', x->>'ce_finder_url', nullif(x->>'ce_updated_at', '')::date
      from jsonb_array_elements(p_rows) x
      on conflict (id) do nothing;
    update training_programs t set ce_ctid = m.ce_ctid, ce_finder_url = m.ce_finder_url, ce_updated_at = m.ce_updated_at
      from _ce_match m where t.id = m.id and t.source = 'dol';
    get diagnostics n = row_count;
    drop table _ce_match;
  end if;
  return n;
end;
$$;
revoke all on function public.set_ce_matches(jsonb, boolean) from public, anon, authenticated;
