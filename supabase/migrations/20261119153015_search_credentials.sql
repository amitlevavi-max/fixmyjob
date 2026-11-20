-- Profile → "Certifications I have": search any certification / license to mark as held (Amit, 2026-11-19).
-- (search_credentials itself is replaced by 20261119153041_search_credentials_v2.sql)
create index if not exists credentials_name_trgm on public.credentials using gin (lower(name) extensions.gin_trgm_ops);
