/**
 * Aspiration Engine
 *
 * Determines what message to show the user on the EarningsRank screen.
 * The goal is always forward motion — no matter where someone sits in the
 * distribution, we show them a clear, achievable next step.
 *
 * Three scenarios:
 *
 * 1. BELOW_MEDIAN  (earnings < local P50)
 *    → "Most comparable workers earn more than you."
 *    → Show gap to median and CTA to close it.
 *
 * 2. ABOVE_MEDIAN  (local P50 ≤ earnings < local P75)
 *    → "You're above average — but the top 25% earn $X."
 *    → Show gap to P75 and CTA to reach it.
 *
 * 3. TOP_EARNER    (earnings ≥ local P75)
 *    → Two paths: relocate to a market where they'd be mid-range,
 *      or step into an occupation where the median beats their pay.
 */

import { OccupationWages, OCCUPATIONS, ALL_OCCUPATIONS_BENCHMARK } from './blsOews';
import { STATES, getWageMultiplier } from './locationData';

// ── Scenario types ────────────────────────────────────────────────────────────

export type Scenario = 'BELOW_MEDIAN' | 'ABOVE_MEDIAN' | 'TOP_EARNER';

export interface MarketSuggestion {
  label: string;         // e.g. "Seattle, WA" or "Washington State"
  localP75: number;      // adjusted P75 wage for that market
  gain: number;          // how much more than current earnings
}

export interface CareerStep {
  title: string;         // BLS occupation title
  medianWage: number;    // P50 for that occupation (national)
  gain: number;          // how much more than current earnings
}

export interface AspirationResult {
  scenario: Scenario;
  localMedian: number;       // P50 adjusted for location
  localP75: number;          // P75 adjusted for location
  gapToMedian: number;       // earnings - localMedian (negative = below)
  gapToP75: number;          // localP75 - earnings
  higherMarkets: MarketSuggestion[];   // populated only for TOP_EARNER
  careerSteps: CareerStep[];           // populated only for TOP_EARNER
}

// ── Core function ─────────────────────────────────────────────────────────────

export function getAspirationResult(params: {
  annualEarnings: number;
  matchedOccupation: OccupationWages | null;
  locationState: string | null;
  locationIsMetro: boolean | null;
  locationMetro: string | null;
  /** Already location-adjusted wages (e.g. live state data). Overrides the
   *  occupation × multiplier estimate for the median / P75 figures. */
  localWages?: { p50: number; p75: number };
}): AspirationResult {
  const { annualEarnings, matchedOccupation, locationState, locationIsMetro, locationMetro, localWages } = params;

  const wages = matchedOccupation ?? ALL_OCCUPATIONS_BENCHMARK;

  // Compute location multiplier
  const multiplier = locationState
    ? getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
    : 1.0;

  const localMedian = Math.round(localWages ? localWages.p50 : wages.p50 * multiplier);
  const localP75    = Math.round(localWages ? localWages.p75 : wages.p75 * multiplier);
  const gapToMedian = annualEarnings - localMedian;
  const gapToP75    = localP75 - annualEarnings;

  // Determine scenario
  let scenario: Scenario;
  if (annualEarnings < localMedian) {
    scenario = 'BELOW_MEDIAN';
  } else if (annualEarnings < localP75) {
    scenario = 'ABOVE_MEDIAN';
  } else {
    scenario = 'TOP_EARNER';
  }

  const higherMarkets: MarketSuggestion[] = [];
  const careerSteps: CareerStep[] = [];

  if (scenario === 'TOP_EARNER') {
    // ── Find markets where P75 (adjusted) beats current earnings ──────────────
    for (const state of STATES) {
      // Skip current location
      if (locationState && state.abbr === locationState && !locationIsMetro) continue;

      // State-level (non-metro)
      const stateMultiplier = getWageMultiplier(state.abbr, false);
      const stateP75 = wages.p75 * stateMultiplier;
      if (stateP75 > annualEarnings) {
        higherMarkets.push({
          label: state.name,
          localP75: Math.round(stateP75),
          gain: Math.round(stateP75 - annualEarnings),
        });
      }

      // Metro-level
      for (const metro of state.metros) {
        if (
          locationState === state.abbr &&
          locationIsMetro &&
          locationMetro === metro.name
        ) continue;

        const metroMultiplier = getWageMultiplier(state.abbr, true, metro.name);
        const metroP75 = wages.p75 * metroMultiplier;
        if (metroP75 > annualEarnings) {
          higherMarkets.push({
            label: `${metro.name}, ${state.abbr}`,
            localP75: Math.round(metroP75),
            gain: Math.round(metroP75 - annualEarnings),
          });
        }
      }
    }

    // Sort by gain ascending (most achievable step first), keep top 3
    higherMarkets.sort((a, b) => a.gain - b.gain);
    higherMarkets.splice(3);

    // ── Find career steps where national P50 beats current earnings ───────────
    for (const occ of OCCUPATIONS) {
      if (matchedOccupation && occ.soc === matchedOccupation.soc) continue;
      const occMedian = occ.p50 * multiplier; // adjust to same location
      if (occMedian > annualEarnings) {
        careerSteps.push({
          title: occ.title,
          medianWage: Math.round(occMedian),
          gain: Math.round(occMedian - annualEarnings),
        });
      }
    }

    // Sort by gain ascending (closest step first), keep top 3
    careerSteps.sort((a, b) => a.gain - b.gain);
    careerSteps.splice(3);
  }

  return { scenario, localMedian, localP75, gapToMedian, gapToP75, higherMarkets, careerSteps };
}

/**
 * Always returns career steps regardless of scenario — used by the Rise track.
 * Finds occupations whose location-adjusted P50 is higher than currentEarnings,
 * sorted ascending by gain (most achievable first), capped at 3.
 */
export function getCareerSteps(params: {
  currentEarnings: number;
  matchedOccupation: OccupationWages | null;
  locationState: string | null;
  locationIsMetro: boolean | null;
  locationMetro: string | null;
}): CareerStep[] {
  const { currentEarnings, matchedOccupation, locationState, locationIsMetro, locationMetro } = params;

  const multiplier = locationState
    ? getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
    : 1.0;

  const steps: CareerStep[] = [];

  for (const occ of OCCUPATIONS) {
    if (matchedOccupation && occ.soc === matchedOccupation.soc) continue;
    const adjustedMedian = occ.p50 * multiplier;
    if (adjustedMedian > currentEarnings) {
      steps.push({
        title: occ.title,
        medianWage: Math.round(adjustedMedian),
        gain: Math.round(adjustedMedian - currentEarnings),
      });
    }
  }

  steps.sort((a, b) => a.gain - b.gain);
  return steps.slice(0, 3);
}
