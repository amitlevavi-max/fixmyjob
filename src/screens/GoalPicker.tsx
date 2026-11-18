import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore, Goal } from '../store/userStore';
import { FEATURES } from '../config/features';
import { backToProfile, goTab, onboardingTotal } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import OptionCard from '../components/OptionCard';
import { Headline, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'GoalPicker'>;

// label: shown on the card · toDo: used in sentences ("I've made a plan to …")
// · howTo: heading of the goal's part of the plan · chip: short tag on plan items
export const GOALS: Array<{ id: Goal; icon: string; label: string; sub: string; toDo: string; howTo: string; chip: string }> = [
  { id: 'earn_more', icon: 'cash-multiple', label: 'Earn more money', sub: 'Get paid what your work is worth', toDo: 'earn more money', howTo: 'How you can earn more money', chip: 'More pay' },
  { id: 'rise_up', icon: 'stairs-up', label: 'Get promoted', sub: 'Lead a team, get a better title', toDo: 'get promoted', howTo: 'How you can get promoted', chip: 'Promotion' },
  { id: 'work_life_balance', icon: 'scale-balance', label: 'Better work-life balance', sub: 'Fairer hours, more time off', toDo: 'get a better work-life balance', howTo: 'How you can get a better work-life balance', chip: 'Work-life' },
  { id: 'change_careers', icon: 'swap-horizontal', label: 'Change careers', sub: 'Move into a new line of work', toDo: 'change careers', howTo: 'How you can change careers', chip: 'New career' },
  { id: 'claim_rights', icon: 'shield-check-outline', label: 'Claim my rights', sub: 'Pay, overtime, safety, time off', toDo: 'claim my rights', howTo: 'How you can claim your rights', chip: 'Rights' },
  { id: 'less_physical', icon: 'human-handsup', label: 'Less physical work', sub: 'Work that is easier on your body', toDo: 'find less physical work', howTo: 'How you can find less physical work', chip: 'Easier work' },
];
export const goalInfo = (id: Goal | null | undefined) => GOALS.find((g) => g.id === id);
/** The goals people can pick now (some are switched off in config/features) */
export const PICKABLE_GOALS = GOALS.filter((g) => !FEATURES.disabledGoals.includes(g.id));

export default function GoalPickerScreen() {
  const params = useRoute<RouteProp<RootStackParamList, 'GoalPicker'>>().params;
  const editing = !!params?.edit;
  if (editing && params?.others) return <OtherGoals />;
  return <MainGoal editing={editing} />;
}

/** Onboarding (one goal) and Profile → Main goal */
function MainGoal({ editing }: { editing: boolean }) {
  const navigation = useNavigation<Nav>();
  const { setFocusGoal, focusGoal, goals } = useUserStore();
  const [selected, setSelected] = useState<Goal | null>(editing ? focusGoal : null);
  const has = (id: Goal) => goals.some((g) => g.id === id);

  function handleNext() {
    if (!selected) return;
    // The chosen goal becomes the main one. Earlier goals stay, with their plan items.
    const isNew = !has(selected);
    setFocusGoal(selected);
    // Onboarding: how happy they are with this goal now, then the job questions (Amit, 2026-10-27)
    if (!editing) navigation.navigate('JobSatisfaction');
    else if (isNew) goTab(navigation, 'Plan');      // show what the new goal added
    else backToProfile(navigation, 'Main goal');
  }

  return (
    <Screen
      footer={<Button label={t(editing ? 'Save' : 'Continue →')} onPress={handleNext} disabled={!selected} />}
    >
      {editing ? <TopBar onBack={() => navigation.goBack()} label={t('Main goal')} /> : <TopBar step={1} total={onboardingTotal(selected ?? focusGoal)} />}

      <Headline accent={t('focus on?')}>{t('Which goal would you like to')}</Headline>
      {editing && goals.length ? <Lead>{t('Your other goals and your plan stay.')}</Lead> : null}

      <View style={styles.list}>
        {PICKABLE_GOALS.map((g) => (
          <OptionCard
            key={g.id}
            icon={g.icon}
            title={t(g.label)}
            subtitle={editing && g.id === focusGoal ? t('Your main goal now') : editing && has(g.id) ? t('One of your goals') : t(g.sub)}
            selected={selected === g.id}
            onPress={() => setSelected(g.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

/** Profile / My plan → tick any other goals; their suggestions join the one task list */
function OtherGoals() {
  const navigation = useNavigation<Nav>();
  const { focusGoal, goals, setOtherGoals } = useUserStore();
  const before = goals.filter((g) => g.id !== focusGoal).map((g) => g.id);
  const [picked, setPicked] = useState<Goal[]>(before);
  const main = GOALS.find((g) => g.id === focusGoal);
  const toggle = (id: Goal) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  function save() {
    const added = picked.some((id) => !before.includes(id));
    setOtherGoals(picked);
    if (added) goTab(navigation, 'Plan');           // show what they added
    else backToProfile(navigation, 'Other goals');
  }

  return (
    <Screen footer={<Button label={t('Save')} onPress={save} />}>
      <TopBar onBack={() => navigation.goBack()} label={t('Other goals')} />
      <Headline accent={t('want help with?')}>{t('What else do you')}</Headline>
      <Lead>
        {main
          ? t('Your main goal: {goal}. Tick any others — what helps them joins your plan.', { goal: t(main.label) })
          : t('Tick any others — what helps them joins your plan.')}
      </Lead>
      <View style={styles.list}>
        {PICKABLE_GOALS.filter((g) => g.id !== focusGoal).map((g) => (
          <OptionCard
            key={g.id}
            mode="check"
            icon={g.icon}
            title={t(g.label)}
            subtitle={t(g.sub)}
            selected={picked.includes(g.id)}
            onPress={() => toggle(g.id)}
          />
        ))}
      </View>
      <Text style={styles.note}>{t('Steps already in your plan stay if you untick a goal.')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  note: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, marginTop: 14 },
});
