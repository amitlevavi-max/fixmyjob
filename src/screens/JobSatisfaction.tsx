import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore, Satisfaction, Goal } from '../store/userStore';
import { FEATURES } from '../config/features';
import { backToProfile, onboardingTotal } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import Icon from '../components/Icon';
import Notice from '../components/Notice';
import { Headline, Lead } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'JobSatisfaction'>;

const ICONS = [
  'emoticon-cry-outline', 'emoticon-sad-outline', 'emoticon-neutral-outline',
  'emoticon-happy-outline', 'emoticon-excited-outline',
];

const HAPPY = ['Very\nunhappy', 'Unhappy', 'OK', 'Happy', 'Very\nhappy'];

/**
 * The question asked depends on the goal. Answers are always 1 (worst) to 5
 * (best). Plain words — many users read English as a second language.
 */
export const SATISFACTION_QUESTIONS: Record<Goal, {
  title: string;      // headline, first part
  accent: string;     // headline, orange part
  short: string;      // Profile row label
  labels: string[];   // 5 answers, worst → best
}> = {
  earn_more: {
    title: 'How happy are you', accent: 'with your pay?',
    short: 'How happy I am with my pay', labels: HAPPY,
  },
  rise_up: {
    title: 'How happy are you with your', accent: 'chances of a promotion?',
    short: 'How happy I am with my chances of a promotion', labels: HAPPY,
  },
  work_life_balance: {
    title: 'How happy are you with your', accent: 'hours and time off?',
    short: 'How happy I am with my hours', labels: HAPPY,
  },
  change_careers: {
    title: 'How happy are you in your', accent: 'line of work?',
    short: 'How happy I am in my line of work', labels: HAPPY,
  },
  claim_rights: {
    title: 'How fairly are you', accent: 'treated at work?',
    short: 'How fairly I am treated',
    labels: ['Very\nunfairly', 'Unfairly', 'Not\nsure', 'Fairly', 'Very\nfairly'],
  },
  less_physical: {
    title: 'How hard is your job', accent: 'on your body?',
    short: 'How hard my job is on my body',
    labels: ['Very\nhard', 'Hard', 'OK', 'Easy', 'Very\neasy'],
  },
};

export const questionFor = (goal: Goal | null) => SATISFACTION_QUESTIONS[goal ?? 'earn_more'];

/** One-line answer for the Profile tab */
export function satisfactionLabel(goal: Goal | null, value: number | null): string | null {
  if (!value) return null;
  const label = questionFor(goal).labels[value - 1];
  return label ? t(label).replace('\n', ' ') : null;
}

export default function JobSatisfactionScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'JobSatisfaction'>>().params?.edit;
  // Asked about the goal the user is focusing on: onboarding step 2 (right after the goal) and Profile
  const { setGoalSatisfaction, goals, focusGoal: goal } = useUserStore();
  const satisfaction = goals.find((g) => g.id === goal)?.satisfaction ?? null;
  const q = questionFor(goal);
  const scale = q.labels.map((label, i) => ({ value: (i + 1) as Satisfaction, icon: ICONS[i], label }));
  const [selected, setSelected] = useState<Satisfaction | null>(editing ? satisfaction : null);

  async function handleNext() {
    if (!selected) return;
    if (goal) setGoalSatisfaction(goal, selected);
    if (editing) { backToProfile(navigation, q.short); return; }
    // Limited launch: manual entry only — the import-method screen is kept but skipped
    navigation.navigate(FEATURES.importMethodChoice ? 'ImportMethod' : 'ManualEntry');
  }

  return (
    <Screen footer={<Button label={t(editing ? 'Save' : 'Next →')} onPress={handleNext} disabled={!selected} />}>
      {editing
        ? <TopBar onBack={() => navigation.goBack()} label={t('Edit')} />
        : <TopBar onBack={() => navigation.goBack()} step={2} total={onboardingTotal(goal)} />}

      <Headline accent={t(q.accent)}>{t(q.title)}</Headline>
      <Lead>{t('Be honest. This helps us see what matters most to you.')}</Lead>

      <Card ticks style={styles.card}>
        <View style={styles.row}>
          {scale.map((s) => {
            const on = selected === s.value;
            return (
              <TouchableOpacity
                key={s.value}
                style={[styles.option, on && styles.optionOn]}
                onPress={() => setSelected(s.value)}
                activeOpacity={0.8}
              >
                <Icon name={s.icon} size={34} color={on ? Colors.accentHi : Colors.slate} />
                <Text style={[styles.label, on && styles.labelOn]}>{t(s.label)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {/* scale ruler */}
        <View style={styles.ruler}>
          {scale.map((s) => (
            <View key={s.value} style={[styles.rulerSeg, selected !== null && s.value <= selected && styles.rulerOn]} />
          ))}
        </View>
      </Card>

      {selected && (
        <Notice tone="accent" icon="f:message-circle">
          {selected <= 2
            ? t("We'll put this first and look for the fastest fixes.")
            : selected === 3
            ? t("There's likely room to do better. Let's find it.")
            : t("A good place to build from. Let's find your next move.")}
        </Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 18, paddingHorizontal: 10 },
  row: { flexDirection: 'row', gap: 6 },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionOn: {
    borderColor: Colors.accentLine,
    backgroundColor: Colors.accentSoft,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 14,
  },
  labelOn: { color: Colors.text },
  ruler: { flexDirection: 'row', gap: 4, marginTop: 14, paddingHorizontal: 6 },
  rulerSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(147,174,221,0.2)' },
  rulerOn: { backgroundColor: Colors.accent },
});
