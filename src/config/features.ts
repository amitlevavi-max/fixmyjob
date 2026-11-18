import type { Goal } from '../store/userStore';

/**
 * Feature switches for the limited launch. Flip a flag to bring a feature
 * back — the screens themselves are kept in the code.
 */
export const FEATURES = {
  /** Let users choose CV upload / LinkedIn import / manual entry.
   *  Off: only manual entry (CV and LinkedIn parsing are still simulated). */
  importMethodChoice: false,
  /** Goals not offered for now (Amit, 2026-10-27: until we invest more time in them).
   *  Hidden in onboarding and in Profile (main goal, other goals); users who already
   *  have one keep it. Remove an id here to offer the goal again. */
  disabledGoals: ['work_life_balance', 'less_physical'] as Goal[],
};
