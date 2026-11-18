/**
 * Moving between the three tabs (Profile · Where I stand · My plan) from any
 * screen, and back to the Profile tab after editing one answer there.
 */
export type TabName = 'Profile' | 'Standing' | 'Plan';

type AnyNav = { navigate: (...args: any[]) => void; reset: (state: any) => void };

/** Open a tab (from a screen pushed on top of the tabs, or from another tab). */
export function goTab(navigation: AnyNav, tab: TabName, params?: Record<string, unknown>) {
  navigation.navigate('Main', { screen: tab, params });
}

/** Replace everything (onboarding, sign-in) with the tabs — no way "back" into onboarding. */
export function resetToTabs(navigation: AnyNav, tab: TabName = 'Standing') {
  navigation.reset({ index: 0, routes: [{ name: 'Main', params: { screen: tab } }] });
}

/** After saving an answer edited from Profile: back to Profile with a short "saved" note. */
export function backToProfile(navigation: AnyNav, saved: string) {
  goTab(navigation, 'Profile', { saved });
}

/**
 * Onboarding length for the progress bar: goal · how happy with it (2026-10-27) ·
 * job · licenses · time in job · pay (6), plus 4 work-and-rights questions for "Claim my rights" users
 * (screen RightsQuestions — other goals never see them, Amit 2026-10-21).
 */
export const RIGHTS_QUESTION_STEPS = 4;
export function onboardingTotal(goal: string | null | undefined): number {
  return 6 + (goal === 'claim_rights' ? RIGHTS_QUESTION_STEPS : 0);
}
