/**
 * Profile tab — every answer the user has given, in one place.
 * Onboarding asks only the focus goal, job, time in job and pay; everything
 * else is asked where it's needed and shows here as "Not set yet" until then.
 * Each row opens the matching editor; results update from the store, so
 * Where I stand and My plan reflect a change straight away.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import type { TabParamList } from '../navigation/MainTabs';
import { useUserStore, goalsByImportance } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import Icon from '../components/Icon';
import Notice from '../components/Notice';
import GhostButton from '../components/GhostButton';
import SectionLabel from '../components/SectionLabel';
import LocationPicker, { LocationResult } from '../components/LocationPicker';
import ZipPrompt from '../components/ZipPrompt';
import { Headline } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { formatTenure, money } from '../lib/format';
import { GOALS } from './GoalPicker';
import { questionFor, satisfactionLabel } from './JobSatisfaction';
import { t } from '../i18n';
import { useOpportunities } from '../lib/useOpportunities';
import LanguageToggle from '../components/LanguageToggle';
import { useRightsAnswer, RIGHTS_KEYS } from './RightsAnswers';
import { coverageSummary } from '../components/HealthCoverageQuestion';
import { membershipSummary } from '../components/UnionMembershipQuestion';

type Nav = StackNavigationProp<RootStackParamList>;

const OVERTIME: Record<number, string> = {
  0: 'overtime not paid', 1: 'overtime at normal rate', 1.25: 'overtime ×1.25', 1.5: 'overtime ×1.5', 2: 'overtime ×2',
};

interface RowProps { label: string; value: string | null; sub?: string | null; onPress: () => void }

function Row({ label, value, sub, onPress }: RowProps) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, !value && styles.rowEmpty]} numberOfLines={2}>{value ?? t('Not set yet')}</Text>
        {sub ? <Text style={styles.rowSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      <Text style={styles.edit}>{t(value ? 'Edit' : 'Add')}</Text>
      <Icon name="f:chevron-right" size={16} color={Colors.slate} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<TabParamList, 'Profile'>>();
  const s = useUserStore();
  const rightsAnswer = useRightsAnswer();
  const rightsAnswered = RIGHTS_KEYS.filter((k) => rightsAnswer(k) !== undefined).length;
  // The promotion / career change the user keeps in the plan (one of each)
  const { all } = useOpportunities();
  const chosenMove = (group: 'promotion' | 'career_change') =>
    all.find((o) => o.exclusiveGroup === group && s.planDecisions[o.id] === 'in_plan');
  const promotion = chosenMove('promotion');
  const careerChange = chosenMove('career_change');
  const heldCreds = Object.entries(s.credentials).filter(([, has]) => has).map(([name]) => name);
  const { user, signOut } = useAuthStore();
  const [showLocation, setShowLocation] = useState(false);
  const [showZip, setShowZip] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // "Saved" note after an edit (from another screen or here)
  useEffect(() => {
    const label = route.params?.saved;
    if (!label) return;
    setSaved(label);
    (navigation as any).setParams?.({ saved: undefined });
  }, [route.params?.saved]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 5000);
    return () => clearTimeout(t);
  }, [saved]);
  // Hide the ZIP box once a ZIP was saved
  useEffect(() => { if (showZip && s.homePoint) { setShowZip(false); setSaved('ZIP code'); } }, [s.homePoint?.zip]);

  const p = s.profile;
  const occTitle = s.matchedOccupation?.title ?? null;
  const goal = GOALS.find((g) => g.id === s.focusGoal);
  const focusSatisfaction = s.goals.find((g) => g.id === s.focusGoal)?.satisfaction ?? null;
  const otherGoals = goalsByImportance(s.goals).slice(1)
    .map((g) => GOALS.find((x) => x.id === g.id)).filter(Boolean)
    .map((g) => t(g!.label)).join(', ');
  const sched = s.workSchedule;
  const strain = s.physicalConcerns.length + s.environmentConcerns.length;
  const email = p.email || user?.email || null;

  async function handleSignOut() {
    await signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  }

  return (
    <Screen>
      <TopBar label={t('Your answers')} />
      <Headline accent={t('profile')}>{t('Your')}</Headline>
      <Text style={styles.lead}>{t('Everything you told us. Change anything — your results update straight away.')}</Text>

      {saved ? (
        <Notice tone="success" icon="f:check-circle">{t('Saved: {what}. Where I stand and My plan are updated.', { what: t(saved) })}</Notice>
      ) : null}

      <SectionLabel icon="f:briefcase">{t('My work')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row
          label={t('Job')}
          value={occTitle ? t(occTitle) : p.role ?? null}
          sub={p.role && occTitle && p.role.toLowerCase() !== occTitle.toLowerCase() ? t('You described it as "{role}"', { role: p.role }) : null}
          onPress={() => navigation.navigate('ManualEntry', { edit: 'job' })}
        />
        <Row label={t('Time in this job')} value={formatTenure(p)} onPress={() => navigation.navigate('ManualEntry', { edit: 'tenure' })} />
        <Row label={t('Pay')} value={p.annualEarnings ? t('{amount}/yr', { amount: money(p.annualEarnings) }) : null} onPress={() => navigation.navigate('ManualEntry', { edit: 'pay' })} />
        <Row label={t('Employer')} value={p.employer ?? null} onPress={() => navigation.navigate('ManualEntry', { edit: 'employer' })} />
        <Row label={t('Health insurance')} value={coverageSummary(s.healthCoverage)} onPress={() => navigation.navigate('HealthCoverage')} />
        <Row label={t('Union')} value={membershipSummary(s.unionMembership)} onPress={() => navigation.navigate('UnionMembership')} />
        <Row
          label={t(questionFor(s.focusGoal).short)}
          value={satisfactionLabel(s.focusGoal, focusSatisfaction)}
          onPress={() => navigation.navigate('JobSatisfaction', { edit: true })}
        />
      </Card>

      <SectionLabel icon="f:map-pin">{t('Where I work')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row label={t('Location')} value={s.locationLabel} onPress={() => setShowLocation(true)} />
        <Row
          label={t('ZIP code')}
          value={s.homePoint ? s.homePoint.zip : null}
          sub={s.homePoint?.city ? t('Closest city: {city}', { city: `${s.homePoint.city}, ${s.homePoint.state}` }) : t('Used to find training near you')}
          onPress={() => setShowZip((v) => !v)}
        />
      </Card>
      {showZip && <ZipPrompt reason={t('To find training near you')} onSkip={() => setShowZip(false)} skipLabel={t('Cancel')} compact />}

      <SectionLabel icon="f:target">{t('My goals')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row
          label={t('Main goal')}
          value={goal ? t(goal.label) : null}
          onPress={() => navigation.navigate('GoalPicker', { edit: true })}
        />
        <Row
          label={t('Other goals')}
          value={otherGoals || null}
          onPress={() => navigation.navigate('GoalPicker', { edit: true, others: true })}
        />
        <Row
          label={t('Next role')}
          value={promotion?.title ?? null}
          onPress={() => (promotion ? navigation.navigate('NextSteps', { opportunityId: promotion.id }) : navigation.navigate('AllSuggestions'))}
        />
        {careerChange && (
          <Row label={t('Career change')} value={careerChange.title}
            onPress={() => navigation.navigate('NextSteps', { opportunityId: careerChange.id })} />
        )}
      </Card>

      <SectionLabel icon="f:award">{t('Skills & certifications')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row
          label={t('Required for my job')}
          value={heldCreds.length ? heldCreds.join(', ') : null}
          onPress={() => navigation.navigate('Credentials', { edit: true })}
        />
      </Card>

      <SectionLabel icon="f:clock">{t('Work conditions')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row
          label={t('Hours and overtime')}
          value={sched ? `${t('{n} h/week', { n: sched.hoursPerWeek })} · ${OVERTIME[sched.overtimeMultiplier] ? t(OVERTIME[sched.overtimeMultiplier]) : t('overtime ×{x}', { x: sched.overtimeMultiplier })}` : null}
          onPress={() => navigation.navigate('NextSteps', { opportunityId: 'minimum-wage-check' })}
        />
        {(s.goals.some((g) => g.id === 'claim_rights') || rightsAnswered > 0) && (
          <Row
            label={t('Work and rights')}
            value={rightsAnswered ? t('{n} of {m} questions answered', { n: rightsAnswered, m: RIGHTS_KEYS.length }) : null}
            sub={t('See and change every answer')}
            onPress={() => navigation.navigate('RightsAnswers')}
          />
        )}
        <Row
          label={t('Physical strain')}
          value={strain ? (strain === 1 ? t('1 concern noted') : t('{n} concerns noted', { n: strain })) : null}
          onPress={() => navigation.navigate('EnvironmentFactors', { edit: true })}
        />
      </Card>

      <SectionLabel icon="f:settings">{t('Preferences')}</SectionLabel>
      <Card padded={false} style={styles.card}>
        <Row
          label={t('Job offers')}
          value={s.wantsJobOffers == null ? null : s.wantsJobOffers ? `${t('Yes (coming soon)')}${email ? ` · ${email}` : ''}` : t('No')}
          onPress={() => navigation.navigate('JobOfferOptIn', { edit: true })}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t('Language')}</Text>
          </View>
          <LanguageToggle save />
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{t('Account')}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{user?.email ?? t('Signed in')}</Text>
          </View>
        </View>
      </Card>
      <GhostButton label={t('Sign out')} onPress={handleSignOut} />

      <LocationPicker
        visible={showLocation}
        onClose={() => setShowLocation(false)}
        onSelect={(result: LocationResult) => {
          s.setLocation(result);
          setShowLocation(false);
          setSaved('Location');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20, marginBottom: 14 },
  card: { paddingVertical: 2, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line,
  },
  rowLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.slate, textTransform: 'uppercase' },
  rowValue: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginTop: 2 },
  rowEmpty: { fontFamily: Fonts.regular, color: Colors.faint, fontStyle: 'italic' },
  rowSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2 },
  edit: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi },
});
