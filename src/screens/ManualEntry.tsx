import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { savePartialProfile } from '../lib/supabase';
import { backToProfile, onboardingTotal } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Chip from '../components/Chip';
import OptionCard from '../components/OptionCard';
import TextField from '../components/TextField';
import SectionLabel from '../components/SectionLabel';
import OccupationPicker, { NO_MATCH } from '../components/OccupationPicker';
import { CATEGORY_OCCUPATIONS } from '../data/blsOews';
import { confidentOccupation, knownOccupation } from '../lib/occupationSearch';
import { Headline, Lead } from '../components/Typography';
import Card from '../components/Card';
import { Colors, Fonts } from '../theme';
import Slider from '../components/Slider';
import Stepper from '../components/Stepper';
import { formatMonths, formatYears, money } from '../lib/format';
import { fetchCredentials, mandatoryOnly } from '../lib/careerData';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'ManualEntry'>;

const JOB_CATEGORIES = [
  'Warehouse', 'Logistics', 'Retail', 'Construction',
  'Hospitality', 'Care', 'Cleaning', 'Security',
  'Driving', 'Delivery', 'Manufacturing', 'Other',
];

// Time in current job: pick a range, then the exact months (under 5 years)
// or the exact years (5–10 years)
const TENURE_RANGES: Array<{
  key: string; label: string;
  min?: number; max?: number;            // months slider
  minYears?: number; maxYears?: number;  // years slider
  years?: number;                        // fixed value (no slider)
}> = [
  { key: 'lt1', label: 'Less than 1 year', min: 0, max: 11 },
  { key: '1to2', label: '1–2 years', min: 12, max: 35 },
  { key: '3to4', label: '3–4 years', min: 36, max: 59 },
  { key: '5to10', label: '5–10 years', minYears: 5, maxYears: 10 },
  { key: '10plus', label: 'More than 10 years', years: 12 },
];
const yearsLabel = formatYears;

// Yearly pay slider
const PAY_MIN = 8000;
const PAY_MAX = 120000;
const PAY_STEP = 500;
const PAY_START = 35000;
const FULL_TIME_HOURS = 2080;   // 40 h × 52 weeks

// Onboarding asks job, time in job and pay here (steps 2–4 of 4; the goal
// comes first). Employer is optional and only asked from Profile.
// Onboarding progress: 1 goal · 2 how happy (JobSatisfaction) · 3 job · 4 required licenses (Credentials screen) · 5 time in job · 6 pay
const progressOf = (step: number) => (step === 1 ? 3 : step + 3);
type EditField = 'job' | 'tenure' | 'pay' | 'employer';
const EDIT_STEP: Record<EditField, number> = { job: 1, tenure: 2, pay: 3, employer: 4 };
const EDIT_LABEL: Record<EditField, string> = { job: 'Job', tenure: 'Time in this job', pay: 'Pay', employer: 'Employer' };

/** The tenure range (and exact months) for a saved profile */
function tenureFromProfile(p: { tenureMonths?: number | null; yearsExperience?: number | null }) {
  const months = p.tenureMonths ?? (p.yearsExperience != null && p.yearsExperience < 5 ? p.yearsExperience * 12 : null);
  if (months != null) {
    const key = months < 12 ? 'lt1' : months < 36 ? '1to2' : '3to4';
    return { key, months, years: null };
  }
  if (p.yearsExperience == null) return { key: '', months: null, years: null };
  if (p.yearsExperience > 10) return { key: '10plus', months: null, years: null };
  return { key: '5to10', months: null, years: Math.max(5, p.yearsExperience) };
}

export default function ManualEntryScreen() {
  const navigation = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'ManualEntry'>>().params;
  const editField = params?.edit;
  const editing = !!editField;
  const { setProfile, setMatchedOccupation, profile, matchedOccupation, locationState, focusGoal } = useUserStore();
  const { user } = useAuthStore();
  const saved = editing ? tenureFromProfile(profile) : { key: '', months: null, years: null };

  const [step, setStep] = useState(editField ? EDIT_STEP[editField] : 1);
  const [jobCategory, setJobCategory] = useState('');
  const [jobTitle, setJobTitle] = useState(editField === 'job' ? profile.role ?? '' : '');
  const [tenureKey, setTenureKey] = useState(saved.key);
  const [tenureMonths, setTenureMonths] = useState<number | null>(saved.months);
  const [tenureYearsPick, setTenureYearsPick] = useState<number | null>(saved.years);
  const [pay, setPay] = useState(editing && profile.annualEarnings ? profile.annualEarnings : PAY_START);
  // The starting pay is a valid answer too — the user can continue without moving the slider
  const [payTouched, setPayTouched] = useState(true);
  const [employer, setEmployer] = useState(editing ? profile.employer ?? '' : '');
  // Occupation confirmation (shown after Q1 when the match isn't clear)
  const [pickingOccupation, setPickingOccupation] = useState(false);
  const [occupationSoc, setOccupationSoc] = useState<string | null>(editing ? matchedOccupation?.soc ?? null : null);
  const [occupationText, setOccupationText] = useState('');

  const [checking, setChecking] = useState(false);

  /** After Q1: use a clear match directly, otherwise ask which is closest. */
  async function resolveOccupation() {
    const typed = jobTitle.trim();
    if (typed) {
      setChecking(true);
      const sure = await confidentOccupation(typed);
      setChecking(false);
      if (sure) { setOccupationSoc(sure.soc); afterJob(sure.soc); return; }
    } else {
      // A category always asks which job is closest (even with one option);
      // only a category with no occupations ("Other") skips straight on
      const list = CATEGORY_OCCUPATIONS[jobCategory] ?? [];
      if (list.length === 0) { setOccupationSoc(NO_MATCH); afterJob(NO_MATCH); return; }
    }
    setOccupationSoc(null);
    setOccupationText(typed);
    setPickingOccupation(true);
  }

  /**
   * Job settled: (editing) save it; otherwise the licenses / certifications
   * the job requires come right after it (Credentials screen, decision Amit
   * 2026-10-20), then the time-in-job question. Jobs with none go straight on.
   */
  async function afterJob(soc: string | null) {
    if (editing) { saveEdit(soc); return; }
    const chosen = soc && soc !== NO_MATCH ? knownOccupation(soc) : null;
    const describedAs = soc === NO_MATCH ? occupationText.trim() : '';
    // Save the job now so the Credentials screen knows it (finish() saves it again)
    setProfile({ role: describedAs || jobTitle.trim() || chosen?.title || jobCategory });
    setMatchedOccupation(chosen);
    if (chosen) {
      setChecking(true);
      const list = mandatoryOnly(await fetchCredentials(chosen.soc, locationState));
      setChecking(false);
      if (list.length) { navigation.navigate('Credentials', { afterJob: true }); return; }
    }
    setStep(2);
  }

  // Back from the Credentials screen (Continue / Skip): on to the time-in-job question
  useEffect(() => {
    if (params?.resume === 'tenure') {
      setStep(2);
      navigation.setParams({ resume: undefined });
    }
  }, [params?.resume]);

  async function handleNext() {
    if (step === 1 && !pickingOccupation) {
      await resolveOccupation();
    } else if (pickingOccupation) {
      setPickingOccupation(false);
      afterJob(occupationSoc);
    } else if (editing) {
      saveEdit(occupationSoc);
    } else if (step < 3) {
      setStep(step + 1);
    } else {
      await finish('');
    }
  }

  /** Exact months (under 5 years) and whole years in the current job */
  function tenureAnswer() {
    const range = TENURE_RANGES.find((r) => r.key === tenureKey);
    const months = range?.min !== undefined ? tenureMonths : null;
    const years = months != null ? Math.floor(months / 12)
      : range?.minYears !== undefined ? tenureYearsPick ?? range.minYears
      : range?.years;
    return { months, years };
  }

  /** Editing from Profile: save just this answer and go back */
  function saveEdit(soc: string | null) {
    if (!editField) return;
    if (editField === 'job') {
      const chosen = soc && soc !== NO_MATCH ? knownOccupation(soc) : null;
      const describedAs = soc === NO_MATCH ? occupationText.trim() : '';
      const role = describedAs || jobTitle.trim() || chosen?.title || jobCategory;
      setProfile({ role });
      setMatchedOccupation(chosen);
    } else if (editField === 'tenure') {
      const { months, years } = tenureAnswer();
      setProfile({ tenureMonths: months, yearsExperience: years });
    } else if (editField === 'pay') {
      setProfile({ annualEarnings: pay });
    } else {
      setProfile({ employer: employer.trim() || undefined });
    }
    backToProfile(navigation, EDIT_LABEL[editField]);
  }

  /** Save all answers and continue (employer may be empty). */
  async function finish(employerInput: string) {
    const chosen = occupationSoc && occupationSoc !== NO_MATCH ? knownOccupation(occupationSoc) : null;
    const describedAs = occupationSoc === NO_MATCH ? occupationText.trim() : '';
    // Keep the user's own words when they typed some; otherwise the chosen title
    const role = describedAs || jobTitle.trim() || chosen?.title || jobCategory;
    const { months, years: yearsExperience } = tenureAnswer();
    const annualEarnings = pay;
    const employerValue = employerInput.trim() || undefined;

    setProfile({ role, yearsExperience, tenureMonths: months, annualEarnings, employer: employerValue });
    // Explicit choice wins over automatic matching (null = compare with all US workers)
    setMatchedOccupation(chosen);

    if (user) {
      await savePartialProfile(user.id, {
        role,
        years_experience: yearsExperience,
        annual_earnings: annualEarnings,
        employer: employerValue,
      });
    }
    // "Claim my rights": four work-and-rights questions first (only for this goal)
    navigation.navigate(focusGoal === 'claim_rights' ? 'RightsQuestions' : 'Calculating');
  }

  // Back steps through the questions before leaving the screen
  function handleBack() {
    if (pickingOccupation) setPickingOccupation(false);
    else if (!editing && step > 1) setStep(step - 1);
    else navigation.goBack();
  }

  // ── Keep the "type your job" box on screen ─────────────────────────────
  // On short screens the box can end up below the fold, and people don't know
  // it's there. When it doesn't fit, scroll so the question is the top line,
  // and (in the "which job is closest" list) show fewer matches up front.
  const scrollRef = useRef<ScrollView | null>(null);
  const [viewportH, setViewportH] = useState(0);   // largest seen, so the keyboard doesn't count
  const [questionY, setQuestionY] = useState(0);
  const [boxTop, setBoxTop] = useState(0);         // top of the block that holds the box
  const [boxBottom, setBoxBottom] = useState(0);   // bottom of the box within that block
  const [maxHits, setMaxHits] = useState(6);
  const [hitsCount, setHitsCount] = useState(0);
  const typedInPicker = occupationText.trim() !== jobTitle.trim() && occupationText !== '';
  const onJobQuestion = step === 1;

  // New question → start again
  useEffect(() => { setMaxHits(6); setBoxBottom(0); }, [step, pickingOccupation]);

  useEffect(() => {
    if (!onJobQuestion || !viewportH || !boxBottom || typedInPicker) return;
    const bottom = boxTop + boxBottom + 8;
    if (bottom <= viewportH) return;                       // fits as it is
    const top = Math.max(0, questionY - 4);
    scrollRef.current?.scrollTo({ y: top, animated: false });
    const shown = Math.min(hitsCount, maxHits);
    if (pickingOccupation && bottom - top > viewportH && shown > 2) setMaxHits(shown - 1);
  }, [onJobQuestion, pickingOccupation, viewportH, questionY, boxTop, boxBottom, hitsCount, maxHits, typedInPicker]);

  const canContinue = pickingOccupation
    ? occupationSoc !== null
    : (step === 1 && !!(jobCategory || jobTitle.trim())) ||
    (step === 2 && !!tenureKey) ||
    (step === 3 && payTouched) ||
    step === 4;

  return (
    <Screen
      scrollRef={scrollRef}
      onViewportHeight={(h) => setViewportH((v) => Math.max(v, h))}
      footer={
        <>
          <Button
            label={editing
              ? t(step === 1 && !pickingOccupation ? 'Next →' : 'Save')
              : t(step < 3 ? 'Next →' : 'See where I stand →')}
            onPress={handleNext}
            loading={checking}
            disabled={!canContinue}
          />
        </>
      }
    >
      {editing
        ? <TopBar onBack={handleBack} label={t('Edit')} />
        : <TopBar onBack={handleBack} step={progressOf(step)} total={onboardingTotal(focusGoal)} />}

      {/* Step 1b: which occupation is closest? */}
      {step === 1 && pickingOccupation && (
        <>
          <View onLayout={(e) => setQuestionY(e.nativeEvent.layout.y)}>
            <Headline accent={t('closest to yours?')}>{t('Which job is')}</Headline>
          </View>
          <Lead>
            {t('Pick the one most like your job, so we compare your pay with people who do the same work.')}
          </Lead>
          <View onLayout={(e) => setBoxTop(e.nativeEvent.layout.y)}>
            <OccupationPicker
              query={jobTitle.trim()}
              category={jobCategory}
              selected={occupationSoc}
              onSelect={setOccupationSoc}
              text={occupationText}
              onTextChange={setOccupationText}
              maxHits={maxHits}
              onHitsCount={setHitsCount}
              onFieldBottom={setBoxBottom}
            />
          </View>
        </>
      )}

      {/* Step 1: Line of work */}
      {step === 1 && !pickingOccupation && (
        <>
          <View onLayout={(e) => setQuestionY(e.nativeEvent.layout.y)}>
            <Headline accent={t('do you do?')}>{t('What work')}</Headline>
          </View>
          <Lead>{t('Pick the closest one, or type your job title.')}</Lead>
          <View style={styles.chips}>
            {JOB_CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(c)}
                selected={jobCategory === c}
                onPress={() => setJobCategory(c)}
              />
            ))}
          </View>
          <View onLayout={(e) => { setBoxTop(e.nativeEvent.layout.y); setBoxBottom(e.nativeEvent.layout.height); }}>
            <SectionLabel>{t('Or type your job title')}</SectionLabel>
            <TextField
              icon="briefcase-outline"
              placeholder={t('e.g. Forklift operator')}
              value={jobTitle}
              onChangeText={setJobTitle}
            />
          </View>
        </>
      )}

      {/* Step 2: Time in current job — range, then exact months under 5 years */}
      {step === 2 && (
        <>
          <Headline accent={t('in this job?')}>{t('How long have you been')}</Headline>
          <Lead>{t('Count only the time in your current job.')}</Lead>
          <View style={styles.list}>
            {TENURE_RANGES.map((r) => {
              const selected = tenureKey === r.key;
              return (
                <View key={r.key}>
                  <OptionCard
                    title={t(r.label)}
                    compact
                    selected={selected}
                    onPress={() => {
                      setTenureKey(r.key);
                      setTenureMonths(r.min !== undefined ? Math.round((r.min + r.max!) / 2) : null);
                      setTenureYearsPick(r.minYears !== undefined ? Math.round((r.minYears + r.maxYears!) / 2) : null);
                    }}
                  />
                  {selected && r.min !== undefined && tenureMonths !== null && (
                    <Card style={styles.exactCard}>
                      <Text style={styles.exactLabel}>{t('HOW LONG EXACTLY?')}</Text>
                      <Text style={styles.exactValue}>{formatMonths(tenureMonths)}</Text>
                      <Slider
                        value={tenureMonths}
                        min={r.min}
                        max={r.max!}
                        step={1}
                        onChange={setTenureMonths}
                        minLabel={formatMonths(r.min)}
                        maxLabel={formatMonths(r.max!)}
                      />
                    </Card>
                  )}
                  {selected && r.minYears !== undefined && tenureYearsPick !== null && (
                    <Card style={styles.exactCard}>
                      <Text style={styles.exactLabel}>{t('HOW MANY YEARS?')}</Text>
                      <Text style={styles.exactValue}>{yearsLabel(tenureYearsPick)}</Text>
                      <Slider
                        value={tenureYearsPick}
                        min={r.minYears}
                        max={r.maxYears!}
                        step={1}
                        onChange={setTenureYearsPick}
                        minLabel={yearsLabel(r.minYears)}
                        maxLabel={yearsLabel(r.maxYears!)}
                      />
                    </Card>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Step 3: Yearly pay — slider + fine-tune */}
      {step === 3 && (
        <>
          <Headline accent={t('earn in a year?')}>{t('How much do you')}</Headline>
          <Lead>{t('Before tax. Include tips and overtime. We keep this private.')}</Lead>
          <Card style={styles.payCard}>
            <Text style={[styles.payValue, !payTouched && { color: Colors.muted }]}>
              {money(pay)}<Text style={styles.payUnit}>{t('/yr')}</Text>
            </Text>
            <Text style={styles.payHourly}>
              {payTouched ? t('≈ ${amount}/hr at full time', { amount: (pay / FULL_TIME_HOURS).toFixed(2) }) : t('Drag the slider to set your pay')}
            </Text>
            <Slider
              value={pay}
              min={PAY_MIN}
              max={PAY_MAX}
              step={PAY_STEP}
              onChange={setPay}
              onTouched={() => setPayTouched(true)}
              minLabel={money(PAY_MIN)}
              maxLabel={`${money(PAY_MAX)}+`}
            />
            <View style={{ marginTop: 10 }}>
              <Stepper
                label={t('Fine-tune')}
                hint="±$500"
                value={pay}
                min={PAY_MIN}
                max={PAY_MAX}
                step={PAY_STEP}
                onChange={(v) => { setPay(v); setPayTouched(true); }}
                format={money}
              />
            </View>
          </Card>
        </>
      )}

      {/* Step 4: Employer */}
      {step === 4 && (
        <>
          <Headline accent={t('work for?')}>{t('Which company do you')}</Headline>
          <Lead>{t('You can leave this empty.')}</Lead>
          <TextField
            large
            icon="f:briefcase"
            placeholder={t('Company name…')}
            value={employer}
            onChangeText={setEmployer}
            autoFocus
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  list: { gap: 8 },
  exactCard: { marginTop: 8, marginBottom: 4 },
  exactLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.5, color: Colors.slate },
  exactValue: { fontSize: 26, fontFamily: Fonts.displayBlack, color: Colors.text, marginTop: 4 },
  payCard: { paddingTop: 18 },
  payValue: { fontSize: 46, lineHeight: 50, fontFamily: Fonts.displayBlack, color: Colors.text },
  payUnit: { fontSize: 20, fontFamily: Fonts.displayBold, color: Colors.slate },
  payHourly: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSoft, marginTop: 2, marginBottom: 8 },
});
