-- cos_catalog_upsert(): one certification listed under several occupations in the same batch hit the same row twice
-- ("ON CONFLICT DO UPDATE command cannot affect row a second time"). Rows are now combined per certification first.
create or replace function public.cos_catalog_upsert(p_rows jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into cos_catalog as g (cert_id, name, acronym, org, org_url, url, description, cert_type, tags, socs, socs_new, seen_at)
  select cert_id, name, acronym, org, org_url, url, description, cert_type,
         coalesce(array(select jsonb_array_elements_text(tags_j)), '{}'), socs, socs, now()
  from (
    select x->>'cert_id' as cert_id,
           (array_agg(x->>'name'))[1] as name,
           (array_agg(nullif(x->>'acronym', '')))[1] as acronym,
           (array_agg(x->>'org'))[1] as org,
           (array_agg(nullif(x->>'org_url', '')))[1] as org_url,
           (array_agg(nullif(x->>'url', '')))[1] as url,
           (array_agg(nullif(x->>'description', '')))[1] as description,
           (array_agg(x->>'cert_type'))[1] as cert_type,
           (array_agg(x->'tags'))[1] as tags_j,
           array(select distinct s from unnest(array_agg(x->>'soc')) s where s is not null order by s) as socs
    from jsonb_array_elements(p_rows) x
    group by x->>'cert_id'
  ) r
  on conflict (cert_id) do update set
    name = excluded.name, acronym = excluded.acronym, org = excluded.org, org_url = excluded.org_url, url = excluded.url,
    description = excluded.description, cert_type = excluded.cert_type, tags = excluded.tags,
    socs_new = array(select distinct s from unnest(g.socs_new || excluded.socs_new) s order by s),
    socs = case when g.socs @> excluded.socs then g.socs
                else array(select distinct s from unnest(g.socs || excluded.socs) s order by s) end,
    seen_at = now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.cos_catalog_upsert(jsonb) from public, anon, authenticated;
grant execute on function public.cos_catalog_upsert(jsonb) to service_role;
