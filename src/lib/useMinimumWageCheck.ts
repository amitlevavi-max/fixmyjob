import { useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import { checkMinimumWage, defaultSchedule } from './wageCheck';

/** The minimum-wage check for the current user (store-driven). */
export function useMinimumWageCheck() {
  const { profile, locationState, locationIsMetro, locationMetro, workSchedule } = useUserStore();
  return useMemo(
    () =>
      checkMinimumWage({
        annualEarnings: profile.annualEarnings ?? 0,
        hourlyRate: profile.hourlyRate ?? null,
        stateAbbr: locationState,
        isMetro: locationIsMetro,
        metro: locationMetro,
        schedule: workSchedule ?? defaultSchedule(locationState),
      }),
    [profile.annualEarnings, profile.hourlyRate, locationState, locationIsMetro, locationMetro, workSchedule],
  );
}
