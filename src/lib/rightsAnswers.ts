/**
 * Saving one answer to a Claim my rights question. Most answers go to
 * store.rightsFacts; hours / days / overtime pay also update the work schedule
 * used by the minimum-wage and overtime engine (lib/wageCheck), and the
 * employer goes to the profile.
 */
import { useUserStore } from '../store/userStore';
import { defaultSchedule } from './wageCheck';
import type { QKey, RightsFacts } from './rightsFacts';

const OT_MULTIPLIER: Record<string, number | undefined> = { '1.5': 1.5, same: 1, none: 0, comp: 0 };

export function answerRightsQuestion(key: QKey, value: unknown) {
  const s = useUserStore.getState();
  const schedule = s.workSchedule ?? defaultSchedule(s.locationState);
  const facts = s.rightsFacts;
  const skipped = (facts.skipped ?? []).filter((k) => k !== key);

  if (key === 'employer') {
    const v = String(value ?? '').trim();
    s.setProfile({ employer: v || undefined });
    s.setRightsFacts({ skipped });
    return;
  }
  if (key === 'hoursPerWeek' || key === 'daysPerWeek') {
    s.setWorkSchedule({ ...schedule, [key]: Number(value) });
    const asked = new Set(facts.scheduleAsked ?? []);
    asked.add(key);
    s.setRightsFacts({ scheduleAsked: [...asked], skipped });
    return;
  }
  if (key === 'otPay') {
    const mult = OT_MULTIPLIER[String(value)];
    if (mult !== undefined) s.setWorkSchedule({ ...schedule, overtimeMultiplier: mult });
  }
  s.setRightsFacts({ [key]: value, skipped } as Partial<RightsFacts>);
}

/** "Skip": not asked again until the user taps "Answer now" */
export function skipRightsQuestion(key: QKey) {
  const s = useUserStore.getState();
  const skipped = new Set(s.rightsFacts.skipped ?? []);
  skipped.add(key);
  s.setRightsFacts({ skipped: [...skipped] });
}

/** "Answer now": ask the skipped questions of one right again */
export function unskipRightsQuestions(keys: QKey[]) {
  const s = useUserStore.getState();
  s.setRightsFacts({ skipped: (s.rightsFacts.skipped ?? []).filter((k) => !keys.includes(k as QKey)) });
}
