-- Decision 2026-10-19 (Amit): O*NET "Supplemental" related jobs (ranks 11–20) are never
-- a promotion. They may still be shown as career changes.
-- The refresh-benchmarks "careerpaths" job applies this from now on (careerPaths.ts,
-- isPrimaryTier); this migration fixes the rows already in the table so the app sees
-- the rule before the next refresh.
-- The supervisor rule is unchanged: the first-line supervisor of the job's group stays
-- an advancement whatever its O*NET tier.

update public.occupation_links
set kind  = case when pay_ratio > 1 then 'career_change' else 'lower_pay' end,
    basis = array_remove(array_remove(basis, 'job_zone'), 'pay'),
    updated_at = now()
where kind = 'advancement'
  and related_tier = 'Supplemental'
  and not ('supervisor' = any(basis));

comment on column public.occupation_links.kind is
  'advancement | career_change | lower_pay. Advancement = supervisor of the job''s group, or a Primary-Short/Primary-Long related job that needs more preparation or pays ≥ 20% more. Supplemental related jobs (O*NET ranks 11–20) are never advancement (decision 2026-10-19).';
