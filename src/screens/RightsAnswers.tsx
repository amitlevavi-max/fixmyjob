/**
 * Profile → Work and rights: every Claim my rights question and the user's
 * answer, in one list. Tap a question to change the answer (or answer one that
 * was skipped or never asked). Saving goes through answerRightsQuestion, so the
 * work schedule, profile and every right that uses the fact update at once.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useUserStore } from '../store/userStore';
import { defaultSchedule } from '../lib/wageCheck';
import {
  QUESTIONS, PAY_UNIT_OPTIONS, WORK_TYPE_OPTIONS, SHIFT_OPTIONS, CONCERN_OPTIONS,
  type Question, type QKey,
} from '../lib/rightsFacts';
import { answerRightsQuestion } from '../lib/rightsAnswers';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Button from '../components/Button';
import TextField from '../components/TextField';
import Icon from '../components/Icon';
import SectionLabel from '../components/SectionLabel';
import { Headline } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { useNavigation } from '@react-navigation/native';

/** The four onboarding questions, in the same shape as the follow-up ones */
const BASICS: Record<string, Question> = {
  payUnit: { key: 'payUnit', kind: 'single', prompt: 'How are you paid?', options: PAY_UNIT_OPTIONS },
  workType: { key: 'workType', kind: 'single', prompt: 'At tax time, do you get a W-2 or a 1099?', options: WORK_TYPE_OPTIONS },
  shifts: { key: 'shifts', kind: 'multi', prompt: 'Which of these happen in your job?', options: SHIFT_OPTIONS },
  concerns: { key: 'concerns', kind: 'multi', prompt: 'Has any of this happened to you?', options: CONCERN_OPTIONS },
};
const ALL: Record<string, Question> = { ...BASICS, ...QUESTIONS };

export const RIGHTS_GROUPS: Array<{ title: string; icon: string; keys: string[] }> = [
  { title: 'Your work', icon: 'f:briefcase', keys: ['payUnit', 'workType', 'hoursPerWeek', 'daysPerWeek', 'shifts', 'concerns'] },
  { title: 'Pay and overtime', icon: 'f:dollar-sign', keys: ['otPay', 'salariedDuties', 'unpaidKinds', 'unpaidMinutes', 'deductionKinds', 'deductionsPerMonth'] },
  { title: 'Shifts, breaks and sick time', icon: 'f:coffee', keys: ['longShiftDays', 'longShiftHours', 'mealBreak', 'restBreaks', 'sentHomePerMonth', 'premiumOthers', 'sickLeave'] },
  { title: 'Employee or contractor', icon: 'f:file-text', keys: ['cSchedule', 'cRefuse', 'cTools', 'cOthers', 'cCore'] },
  { title: 'Speaking up', icon: 'f:message-circle', keys: ['retaliationKinds', 'retaliationWhen'] },
  { title: 'About your job', icon: 'f:home', keys: ['employer', 'union'] },
];
export const RIGHTS_KEYS = RIGHTS_GROUPS.flatMap((g) => g.keys);

/** The saved answer for a question (undefined = not answered) */
export function useRightsAnswer() {
  const { rightsFacts: f, workSchedule, locationState, profile } = useUserStore();
  const schedule = workSchedule ?? defaultSchedule(locationState);
  return (key: string): unknown => {
    if (key === 'hoursPerWeek' || key === 'daysPerWeek') {
      // Onboarding always asks hours; days only count once asked
      const asked = (f.scheduleAsked ?? []).includes(key) || (key === 'hoursPerWeek' && !!f.answeredAt);
      return asked ? schedule[key] : undefined;
    }
    if (key === 'employer') return profile.employer || undefined;
    return (f as Record<string, unknown>)[key];
  };
}

function answerText(q: Question, v: unknown, skipped: boolean): string | null {
  if (v === undefined || v === null || v === '') return skipped ? t('Skipped') : null;
  if (v === 'unsure') return t('Not sure');
  if (q.kind === 'text') return String(v);
  const label = (x: unknown) => {
    const o = q.options?.find((o) => o.value === x);
    return o ? t(o.label) : String(x);
  };
  if (Array.isArray(v)) return v.length ? v.map(label).join(', ') : t('None');
  return label(v);
}

export default function RightsAnswersScreen() {
  const navigation = useNavigation();
  const { rightsFacts: f } = useUserStore();
  const get = useRightsAnswer();
  const skipped = new Set(f.skipped ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const answered = RIGHTS_KEYS.filter((k) => get(k) !== undefined).length;

  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} label={t('Work and rights')} />
      <Headline accent={t('and rights')}>{t('Your work')}</Headline>
      <Text style={styles.lead}>
        {t('Every question we ask to check your rights, and your answers. Tap one to change it. {n} of {m} answered.', { n: answered, m: RIGHTS_KEYS.length })}
      </Text>

      {RIGHTS_GROUPS.map((g) => (
        <View key={g.title}>
          <SectionLabel icon={g.icon}>{t(g.title)}</SectionLabel>
          <Card padded={false} style={styles.card}>
            {g.keys.map((k) => {
              const q = ALL[k];
              if (!q) return null;
              const value = get(k);
              const text = answerText(q, value, skipped.has(k));
              const isOpen = open === k;
              return (
                <View key={k} style={styles.row}>
                  <TouchableOpacity style={styles.rowHead} onPress={() => setOpen(isOpen ? null : k)} activeOpacity={0.75}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prompt}>{t(q.prompt)}</Text>
                      <Text style={[styles.value, !text && styles.empty]}>{text ?? t('Not answered yet')}</Text>
                    </View>
                    <Text style={styles.edit}>{isOpen ? t('Close') : t(value === undefined ? 'Add' : 'Edit')}</Text>
                    <Icon name={isOpen ? 'f:chevron-up' : 'f:chevron-down'} size={16} color={Colors.slate} />
                  </TouchableOpacity>
                  {isOpen && <Editor q={q} value={value} onDone={() => setOpen(null)} />}
                </View>
              );
            })}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

/** Change one answer: single answers save on tap, multi and text with "Save" */
function Editor({ q, value, onDone }: { q: Question; value: unknown; onDone: () => void }) {
  const [picked, setPicked] = useState<Array<string | number>>(Array.isArray(value) ? value : []);
  const [text, setText] = useState(typeof value === 'string' && q.kind === 'text' ? value : '');
  const save = (v: unknown) => { answerRightsQuestion(q.key as QKey, v); onDone(); };

  if (q.kind === 'text') {
    return (
      <View style={styles.editor}>
        {q.help ? <Text style={styles.help}>{t(q.help)}</Text> : null}
        <TextField value={text} onChangeText={setText} placeholder={t('Company name')} autoCapitalize="words" />
        <View style={styles.btnRow}>
          <Button size="sm" label={t('Save')} onPress={() => save(text)} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.editor}>
      {q.help ? <Text style={styles.help}>{t(q.help)}</Text> : null}
      <View style={styles.chips}>
        {q.options?.map((o) => (
          <Chip
            key={String(o.value)}
            label={t(o.label)}
            selected={q.kind === 'multi' ? picked.includes(o.value) : value === o.value}
            onPress={() => {
              if (q.kind === 'multi') setPicked(picked.includes(o.value) ? picked.filter((x) => x !== o.value) : [...picked, o.value]);
              else save(o.value);
            }}
          />
        ))}
        {q.unsure && <Chip label={t('Not sure')} selected={value === 'unsure'} onPress={() => save('unsure')} />}
      </View>
      {q.kind === 'multi' && (
        <View style={styles.btnRow}>
          <Button size="sm" label={t('Save')} onPress={() => save(picked)} />
          <Button size="sm" variant="secondary" label={t('None of these')} onPress={() => save([])} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, marginBottom: 14 },
  card: { paddingVertical: 2, marginBottom: 16 },
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prompt: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft, lineHeight: 18 },
  value: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, marginTop: 3 },
  empty: { fontFamily: Fonts.regular, color: Colors.faint, fontStyle: 'italic' },
  edit: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi },
  editor: { marginTop: 10 },
  help: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
});
