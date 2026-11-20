-- search_credentials: Credential Engine + CareerOneStop records (licenses only for the user's state), the user's
-- own job first, names / issuers / acronyms (bls → Basic Life Support); stricter fuzzy match.
create or replace function public.cred_initials(p text) returns text
language sql immutable set search_path = public as $$
  select string_agg(left(w, 1), '' order by n)
  from regexp_split_to_table(lower(regexp_replace(p, '\(.*?\)', '', 'g')), '[^a-z0-9]+') with ordinality as t(w, n)
  where w <> '' and w not in ('of', 'and', 'the', 'for', 'in', 'a', 'an', 'certification', 'certificate', 'certified')
$$;

create or replace function public.search_credentials(q text, p_state text default null, p_soc text default null, lim int default 12)
returns table(id text, name text, issuer text, kind text, state text, in_demand boolean, for_job boolean)
language sql stable security definer set search_path = public, extensions as $$
  with w as (select lower(trim(q)) as q, lower(trim(q)) ~ '^[a-z0-9]{2,6}$' as acr),
  pool as (
    select c.id, c.name, c.issuer, c.kind, c.state, c.alternate_names as alt, null::text as acronym,
           coalesce(c.cos_in_demand, false) as in_demand,
           (p_soc is not null and c.socs @> array[p_soc]) as for_job
    from public.credentials c
    where c.kind in ('certification', 'license', 'badge', 'apprenticeship')
      and (c.state is null or c.state = p_state)
    union all
    select 'cos-' || k.cert_id, k.name, k.org, 'certification', null, null, k.acronym,
           coalesce(k.in_demand, false), (p_soc is not null and p_soc = any(k.socs))
    from public.cos_catalog k
    where not exists (select 1 from public.credentials c where c.id = 'cos-' || k.cert_id or c.cos_cert_id = k.cert_id)
  ),
  hits as (
    select p.*, lower(p.name) like w.q || '%' as starts, similarity(lower(p.name), w.q) as sim,
           (w.acr and (lower(coalesce(p.acronym, '')) = w.q or lower(p.name) ~ ('\m' || w.q || '\M') or cred_initials(p.name) = w.q)) as acr_hit
    from pool p, w
    where length(w.q) >= 2
      and (lower(p.name) like '%' || w.q || '%'
           or lower(coalesce(p.alt, '')) like '%' || w.q || '%'
           or lower(coalesce(p.issuer, '')) like '%' || w.q || '%'
           or similarity(lower(p.name), w.q) > 0.45
           or (w.acr and (lower(coalesce(p.acronym, '')) = w.q or cred_initials(p.name) = w.q)))
  ),
  one as (
    select distinct on (lower(name)) * from hits
    order by lower(name), for_job desc, in_demand desc, (state is null) desc
  )
  select id, name, issuer, kind, state, in_demand, for_job from one
  order by for_job desc, (starts or acr_hit) desc, in_demand desc, sim desc, length(name)
  limit least(greatest(lim, 1), 30);
$$;
grant execute on function public.search_credentials(text, text, text, int) to anon, authenticated;
