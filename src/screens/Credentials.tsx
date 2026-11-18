/**
 * "Do you have these?" — the mandatory licenses / certifications of the
 * user's job (official list, lib/careerData). Asked in onboarding right after
 * the job question (ManualEntry → here → back to ManualEntry's time-in-job
 * question; from the CV path: DataReview → here → Calculating), and from
 * Profile (edit mode).
 *
 * Every credential the user doesn't have becomes a plan item (data/careerMoves)
 * worth the certified-vs-uncertified pay difference in their job (Census CPS).
 * Jobs with no mandatory credentials (or no matched occupation) skip the screen.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useCredentials, mandatoryOnly } from '../lib/careerData';
import { backToProfile, onboardingTotal } from '../lib/nav';
import { shortJobName } from '../lib/format';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Notice from '../components/Notice';
import { Headline, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'Credentials'>;

export default function CredentialsScreen() {
  const navigation = useNavigation<Nav>();
  const params = useRoute<RouteProp<RootStackParamList, 'Credentials'>>().params;
  const editing = !!params?.edit;
  const afterJob = !!params?.afterJob;
  // Onboarding: next question (ManualEntry) or, from the CV path, the results
  const next = () => (afterJob ? navigation.navigate('ManualEntry', { resume: 'tenure' }) : navigation.navigate('Calculating'));
  const { matchedOccupation, locationState, credentials, setCredentialAnswer, focusGoal } = useUserStore();
  const soc = matchedOccupation?.soc ?? null;
  const { loading, data } = useCredentials(soc, locationState);
  const list = mandatoryOnly(data);
  const [answers, setAnswers] = useState<Record<string, boolean | undefined>>({});

  // Start from what the user already told us (same credential in an earlier job, or Profile)
  useEffect(() => {
    if (!data) return;
    setAnswers(Object.fromEntries(mandatoryOnly(data).map((c) => [c.name, credentials[c.name]])));
  }, [data]);

  // Nothing to ask (no matched job, no mandatory credentials, or data unavailable) → next step
  const nothingToAsk = !soc || (!loading && list.length === 0);
  useEffect(() => {
    if (nothingToAsk && !editing) { if (afterJob) next(); else navigation.replace('Calculating'); }
  }, [nothingToAsk, editing]);

  const allAnswered = list.length > 0 && list.every((c) => answers[c.name] !== undefined);

  function save() {
    for (const c of list) {
      const a = answers[c.name];
      if (a !== undefined) setCredentialAnswer(c.name, a);
    }
    if (editing) backToProfile(navigation, 'Certifications');
    else next();
  }

  const who = matchedOccupation ? shortJobName(matchedOccupation.title) : null;

  return (
    <Screen
      footer={list.length > 0 ? (
        <>
          <Button label={t(editing ? 'Save' : 'Continue →')} onPress={save} disabled={!allAnswered} />
          {!editing && <GhostButton label={t('Skip for now')} onPress={next} />}
        </>
      ) : undefined}
    >
      {editing
        ? <TopBar onBack={() => navigation.goBack()} label={t('Certifications')} />
        : <TopBar onBack={() => navigation.goBack()} step={4} total={onboardingTotal(focusGoal)} />}

      {loading || (nothingToAsk && !editing) ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accentHi} />
          <Text style={styles.loadingText}>{t('Checking the licenses your job needs…')}</Text>
        </View>
      ) : list.length === 0 ? (
        <>
          <Headline>{t('No license needed')}</Headline>
          <Lead>{t('We have no official list of required licenses or certifications for your job yet.')}</Lead>
          <Button label={t('Back')} variant="secondary" onPress={() => navigation.goBack()} />
        </>
      ) : (
        <>
          <Headline accent={t('do you have?')}>{t('Which of these')}</Headline>
          <Lead>
            {who
              ? t('By law, {who} need these. Tell us which you have — any you don\'t have yet goes into your plan.', { who })
              : t('By law, your job needs these. Tell us which you have — any you don\'t have yet goes into your plan.')}
          </Lead>

          {list.map((c) => {
            const a = answers[c.name];
            return (
              <Card key={c.name} style={styles.card}>
                <Text style={styles.name}>{c.name}</Text>
                {c.condition ? <Text style={styles.detail}>{c.condition}</Text> : null}
                {c.authority ? (
                  <Text style={styles.source} onPress={() => Linking.openURL(c.source_url)}>
                    {t('Issued by: {authority}', { authority: c.authority })} · <Text style={styles.link}>{t('Official page')}</Text>
                  </Text>
                ) : null}
                <View style={styles.chips}>
                  <Chip label={t('I have it')} tone="positive" selected={a === true}
                    onPress={() => setAnswers((x) => ({ ...x, [c.name]: true }))} />
                  <Chip label={t('Not yet')} selected={a === false}
                    onPress={() => setAnswers((x) => ({ ...x, [c.name]: false }))} />
                </View>
              </Card>
            );
          })}
          <Notice tone="info" icon="f:info">
            {t('Source: federal rules (FMCSA, CMS, EPA, OSHA) and state licensing boards. Rules can differ by state — check the official page.')}
          </Notice>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12, marginTop: 60 },
  loadingText: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.slate },
  card: { marginBottom: 10 },
  name: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text },
  detail: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.slate, marginTop: 4, lineHeight: 18 },
  source: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.slate, marginTop: 6 },
  link: { color: Colors.accentHi, textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
});
