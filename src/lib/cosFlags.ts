/**
 * CareerOneStop flags on certifications (Amit, 2026-11-18):
 *   In demand          — CareerOneStop (U.S. Dept. of Labor) tags the certification "In-Demand":
 *                        frequently mentioned in online job postings.
 *   Industry endorsed  — tagged "IND": endorsed by a third-party industry association.
 * Stored on credentials by Edge Function refresh-cos-flags (monthly). An item carries them when it IS a
 * flagged certification (lib/flaggedCerts) or its course prepares for one (short_courses leads_to).
 *
 * Shown as an orange highlight + tag in the plan lists (Where I stand, My plan, All suggestions) and
 * explained, with the source, on the item's screen (components/CosFlagNote). Flagged items come first in
 * their effort bucket, even ahead of items with a higher pay figure (lib/planView).
 */
import type { Opportunity } from '../data/opportunityCatalog';

export interface CosFlags {
  inDemand: boolean;
  endorsed: boolean;
  /** When CareerOneStop was last checked for this certification */
  checkedAt: string | null;
  /** The certification the flags belong to */
  credential: string | null;
}

export const COS_SOURCE = 'CareerOneStop (U.S. Department of Labor)';

/** The item's flags, or null when it has none */
export function cosFlagsOf(o: Pick<Opportunity, 'cosFlags' | 'course'>): CosFlags | null {
  if (o.cosFlags) return o.cosFlags.inDemand || o.cosFlags.endorsed ? o.cosFlags : null;
  const leads = o.course?.leads_to ?? [];
  const d = leads.find((x) => x.in_demand);
  const e = leads.find((x) => x.industry_endorsed);
  if (!d && !e) return null;
  const pick = d ?? e!;
  return { inDemand: !!d, endorsed: !!e, checkedAt: pick.cos_checked_at ?? null, credential: pick.name };
}

/** Sort key: in demand first, then industry endorsed, then the rest */
export function cosFlagRank(o: Pick<Opportunity, 'cosFlags' | 'course'>): number {
  const f = cosFlagsOf(o);
  return !f ? 2 : f.inDemand ? 0 : 1;
}
