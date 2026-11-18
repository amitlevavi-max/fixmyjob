/**
 * The union for the user's profession and their membership answer (Amit, 2026-11-13).
 * The union item is suggested only when a union is specific to the user's
 * occupation (data/unionDirectory findUnions) and the user isn't already in a union.
 */
import { useUserStore, type UnionMembership } from '../store/userStore';
import { findUnions, type UnionInfo } from '../data/unionDirectory';

export const UNION_ID = 'union-membership';

/** Member of the suggested union or of another one */
export function isUnionMember(m: UnionMembership | null | undefined): boolean {
  return m?.status === 'member' || m?.status === 'other';
}

/** The unions for the user's job (best first, max 2) */
export function useUserUnions(): UnionInfo[] {
  const { profile, matchedOccupation, locationState } = useUserStore();
  return findUnions({ soc: matchedOccupation?.soc, role: profile.role, title: matchedOccupation?.title, state: locationState });
}

/** The best union for the user's job, or null */
export function useUserUnion(): UnionInfo | null {
  return useUserUnions()[0] ?? null;
}
