/**
 * Claim my rights — four short onboarding questions, asked only of users whose
 * goal is "Claim my rights" (after the pay question, before Calculating):
 *   1. How you're paid (+ hourly rate) and hours per week
 *   2. W-2 or 1099 — the gateway: most wage laws cover employees only
 *   3. Which shifts happen in your job (multi-select)
 *   4. What has happened to you (multi-select, optional) — ranks what we show
 * Also opened from Profile (edit = true) to change the answers.
 * Answers: store.rightsFacts (table worker_rights_answers) and the work
 * schedule used by the minimum-wage / overtime check.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { defaultSchedule } from '../lib/wageCheck';
import {
  PAY_UNIT_OPTIONS, WORK_TYPE_OPTIONS, SHIFT_OPTIONS, CONCERN_OPTIONS,
  type PayUnit, type WorkType, type Shift, type Concern,
} from '../lib/rightsFacts';
import { backToProfile, onboardingTotal } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Slider from '../components/Slider';
import Notice from '../components/Notice';
import { Headline, Lead } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'RightsQuestions'>;
const FIRST_STEP = 7;   // onboarding steps 1–6 come before (goal, how happy … pay)

export default function RightsQuestionsScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'RightsQuestions'>>().params?.edit;
  const {
    focusGoal, profile, setProfile, rightsFacts: f, setRightsFacts, workSchedule, setWorkSchedule, locationState,
  } = useUserStore();
  const schedule = workSchedule ?? defaultSchedule(locationState);

  const [step, setStep] = useState(1);
  const [payUnit, setPayUnit] = useState<PayUnit | undefined>(f.payUnit);
  const [rateText, setRateText] = useState(profile.hourlyRate ? String(profile.hourlyRate) : '');
  const [hours, setHours] = useState(schedule.hoursPerWeek);
  const [workType, setWorkType] = useState<WorkType | undefined>(f.workType);
  const [shifts, setShifts] = useState<Shift[]>(f.shifts ?? []);
  const [concerns, setConcerns] = useState<Concern[]>(f.concerns ?? []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const rate = Number(rateText.replace(/[^0-9.]/g, ''));

  function save() {
    const asked = new Set(f.scheduleAsked ?? []);
    asked.add('hoursPerWeek');
    setWorkSchedule({ ...schedule, hoursPerWeek: hours });
    if (payUnit === 'hour' && rate > 0) setProfile({ hourlyRate: rate });
    else if (payUnit && payUnit !== 'hour') setProfile({ hourlyRate: undefined });
    setRightsFacts({
      payUnit, workType, shifts, concerns,
      scheduleAsked: [...asked],
      answeredAt: f.answeredAt ?? new Date().toISOString(),
    });
    if (editing) backToProfile(navigation, 'Work and rights');
    else navigation.navigate('Calculating');
  }

  const canNext =
    step === 1 ? !!payUnit && (payUnit !== 'hour' || rateText === '' || rate > 0)
    : step === 2 ? !!workType
    : true;
  const next = () => (step < 4 ? setStep(step + 1) : save());
  const back = () => (step > 1 ? setStep(step - 1) : navigation.goBack());

  return (
    <Screen
      footer={
        <>
          <Button label={t(step < 4 ? 'Continue →' : editing ? 'Save' : 'See my results →')} onPress={next} disabled={!canNext} />
          {step >= 3 && (
            <GhostButton
              label={t('None of these')}
              onPress={() => { if (step === 3) { setShifts([]); setStep(4); } else { setConcerns([]); save(); } }}
            />
          )}
        </>
      }
    >
      {editing
        ? <TopBar onBack={back} label={t('Work and rights')} />
        : <TopBar onBack={back} step={FIRST_STEP + step - 1} total={onboardingTotal(focusGoal)} />}

      {step === 1 && (
        <>
          <Headline accent={t('paid?')}>{t('How are you')}</Headline>
          <Lead>{t('This tells us which pay laws apply to you.')}</Lead>
          <View style={styles.chips}>
            {PAY_UNIT_OPTIONS.map((o) => (
              <Chip key={o.value} label={t(o.label)} selected={payUnit === o.value} onPress={() => setPayUnit(o.value as PayUnit)} />
            ))}
          </View>
          {payUnit === 'hour' && (
            <Card style={{ marginTop: 4 }}>
              <Text style={styles.label}>{t('YOUR HOURLY RATE (OPTIONAL)')}</Text>
              <View style={styles.payField}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  style={styles.payInput}
                  value={rateText}
                  onChangeText={setRateText}
                  keyboardType="decimal-pad"
                  placeholder="15.00"
                  placeholderTextColor={Colors.faint}
                />
                <Text style={styles.unit}>{t('per hour')}</Text>
              </View>
            </Card>
          )}
          <Card style={{ marginTop: 12 }}>
            <Text style={styles.label}>{t('IN A NORMAL WEEK, HOW MANY HOURS DO YOU WORK?')}</Text>
            <Text style={styles.big}>{hours >= 80 ? '80+' : hours} <Text style={styles.unit}>{t('hours')}</Text></Text>
            <Slider value={hours} min={5} max={80} step={1} onChange={setHours} minLabel="5" maxLabel="80+" />
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <Headline accent={t('W-2 or a 1099?')}>{t('At tax time, do you get a')}</Headline>
          <Lead>{t('W-2 means you’re an employee. 1099 means you’re paid as a contractor, like most app work. Most wage laws only cover employees.')}</Lead>
          <View style={styles.column}>
            {WORK_TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} label={t(o.label)} selected={workType === o.value} onPress={() => setWorkType(o.value as WorkType)} />
            ))}
          </View>
          {(workType === 'unsure' || workType === 'cash') && (
            <Notice tone="info" icon="f:info">
              {t('No problem — 5 quick questions later will tell whether the law sees you as an employee.')}
            </Notice>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <Headline accent={t('in your job?')}>{t('Which of these happen')}</Headline>
          <Lead>{t('Pick all that apply. Long shifts, nights and being sent home early all have rules in some states.')}</Lead>
          <View style={styles.chips}>
            {SHIFT_OPTIONS.map((o) => (
              <Chip key={o.value} label={t(o.label)} selected={shifts.includes(o.value as Shift)} onPress={() => setShifts(toggle(shifts, o.value as Shift))} />
            ))}
          </View>
        </>
      )}

      {step === 4 && (
        <>
          <Headline accent={t('happened to you?')}>{t('Has any of this')}</Headline>
          <Lead>{t('Optional. It helps us show what matters to you first. Your answers are private.')}</Lead>
          <View style={styles.column}>
            {CONCERN_OPTIONS.map((o) => (
              <Chip key={o.value} label={t(o.label)} selected={concerns.includes(o.value as Concern)} onPress={() => setConcerns(toggle(concerns, o.value as Concern))} />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  column: { gap: 8, alignItems: 'flex-start', marginBottom: 12 },
  label: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 0.8, color: Colors.slate, marginBottom: 8 },
  big: { fontFamily: Fonts.bold, fontSize: 28, color: Colors.text, marginBottom: 8 },
  unit: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.slate },
  payField: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.line, borderRadius: Radii.md, paddingHorizontal: 12, height: 48,
  },
  dollar: { fontFamily: Fonts.bold, fontSize: 18, color: Colors.text },
  payInput: { flex: 1, fontFamily: Fonts.bold, fontSize: 18, color: Colors.text },
});
