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
 *
 * Also lists the other certifications the user marked "I already have it" on a plan item (e.g. a
 * CareerOneStop in-demand certification), so a wrong mark can be undone here (Amit, 2026-11-19).
 * "Not yet" on one of those forgets the answer, so the suggestion comes back.
 * In edit mode the user can also search any certification or license and add it (lib/credentialSearch),
 * or add what they typed when it isn't listed.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Linking, TouchableOpacity } from 'react-native';
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
import TextField from '../components/TextField';
import Icon from '../components/Icon';
import { useCredentialSearch } from '../lib/credentialSearch';
import { Headline, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { track, modeOf } from '../lib/analytics';

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
  // Held certifications that aren't on the job's mandatory list (marked from a plan item)
  const mandatoryNames = new Set(list.map((c) => c.name));
  const [extras, setExtras] = useState<string[]>(() => Object.entries(credentials).filter(([, has]) => has).map(([n]) => n));
  const otherHeld = extras.filter((n) => !mandatoryNames.has(n));
  const [extraAnswers, setExtraAnswers] = useState<Record<string, boolean>>(() => Object.fromEntries(extras.map((n) => [n, true])));

  // Start from what the user already told us (same credential in an earlier job, or Profile)
  useEffect(() => {
    if (!data) return;
    setAnswers(Object.fromEntries(mandatoryOnly(data).map((c) => [c.name, credentials[c.name]])));
  }, [data]);

  // Nothing to ask (no matched job, no mandatory credentials, or data unavailable) → next step
  const nothingToAsk = !soc || (!loading && list.length === 0);
  const hasExtras = otherHeld.length > 0;
  // Search any certification to add (edit mode)
  const [query, setQuery] = useState('');
  const { hits, searching } = useCredentialSearch(editing ? query : '', locationState, soc);
  const heldKeys = new Set([...otherHeld, ...list.map((c) => c.name)].map((n) => n.toLowerCase()));
  const typed = query.trim();
  const typedListed = hits.some((h) => h.name.toLowerCase() === typed.toLowerCase()) || heldKeys.has(typed.toLowerCase());
  function addHeld(name: string) {
    if (!extras.some((n) => n.toLowerCase() === name.toLowerCase())) setExtras((x) => [...x, name]);
    setExtraAnswers((x) => ({ ...x, [name]: true }));
    setQuery('');
  }
  useEffect(() => {
    if (nothingToAsk && !editing) { if (afterJob) next(); else navigation.replace('Calculating'); }
  }, [nothingToAsk, editing]);

  const allAnswered = list.every((c) => answers[c.name] !== undefined) && (list.length > 0 || editing);

  function save() {
    track('continue_click', { step: 'credentials', mode: modeOf(editing) });
    for (const c of list) {
      const a = answers[c.name];
      if (a !== undefined) setCredentialAnswer(c.name, a);
    }
    for (const n of otherHeld) setCredentialAnswer(n, extraAnswers[n] ? true : null);
    if (editing) backToProfile(navigation, 'Certifications');
    else next();
  }

  const who = matchedOccupation ? shortJobName(matchedOccupation.title) : null;

  return (
    <Screen
      footer={list.length > 0 || editing ? (
        <>
          <Button label={t(editing ? 'Save' : 'Continue →')} onPress={save} disabled={!allAnswered} />
          {!editing && <GhostButton label={t('Skip for now')} onPress={() => { track('skip_click', { step: 'credentials' }); next(); }} />}
        </>
      ) : undefined}
    >
      {editing
        ? <TopBar onBack={() => { track('back_click', { step: 'credentials', mode: 'edit' }); navigation.goBack(); }} label={t('Certifications')} />
        : <TopBar onBack={() => { track('back_click', { step: 'credentials', mode: 'onboarding' }); navigation.goBack(); }} step={4} total={onboardingTotal(focusGoal)} />}

      {loading || (nothingToAsk && !editing) ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accentHi} />
          <Text style={styles.loadingText}>{t('Checking the licenses your job needs…')}</Text>
        </View>
      ) : list.length === 0 && !editing ? (
        <>
          <Headline>{t('No license needed')}</Headline>
          <Lead>{t('We have no official list of required licenses or certifications for your job yet.')}</Lead>
          <Button label={t('Back')} variant="secondary" onPress={() => navigation.goBack()} />
        </>
      ) : list.length === 0 ? (
        <>
          <Headline>{t('My certifications')}</Headline>
          <Lead>{t('No license is required by law for your job. Add any certifications you have, and we won\'t suggest them again.')}</Lead>
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
                    onPress={() => { setAnswers((x) => ({ ...x, [c.name]: true })); track('certification_marked', { name: c.name, answer: 'have', mode: modeOf(editing) }); }} />
                  <Chip label={t('Not yet')} selected={a === false}
                    onPress={() => { setAnswers((x) => ({ ...x, [c.name]: false })); track('certification_marked', { name: c.name, answer: 'not_yet', mode: modeOf(editing) }); }} />
                </View>
              </Card>
            );
          })}
          <Notice tone="info" icon="f:info">
            {t('Source: federal rules (FMCSA, CMS, EPA, OSHA) and state licensing boards. Rules can differ by state — check the official page.')}
          </Notice>
        </>
      )}

      {!loading && hasExtras ? (
        <>
          {list.length > 0 ? <Text style={styles.section}>{t('Other certifications you have')}</Text> : null}
          {otherHeld.map((n) => (
            <Card key={n} style={styles.card}>
              <Text style={styles.name}>{n}</Text>
              <View style={styles.chips}>
                <Chip label={t('I have it')} tone="positive" selected={extraAnswers[n] === true}
                  onPress={() => setExtraAnswers((x) => ({ ...x, [n]: true }))} />
                <Chip label={t('Not yet')} selected={extraAnswers[n] === false}
                  onPress={() => setExtraAnswers((x) => ({ ...x, [n]: false }))} />
              </View>
            </Card>
          ))}
          <Text style={styles.detail}>{t('Choose "Not yet" if you marked one by mistake. It will come back in your suggestions.')}</Text>
        </>
      ) : null}

      {!loading && editing ? (
        <>
          <Text style={styles.section}>{t('Add a certification you have')}</Text>
          <TextField
            icon="f:search"
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search, e.g. CPR, forklift, CDL')}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator color={Colors.accentHi} style={{ marginTop: 8 }} /> : null}
          {typed.length >= 2 ? hits.map((h) => {
            const held = heldKeys.has(h.name.toLowerCase());
            return (
              <TouchableOpacity key={h.id} style={styles.hit} disabled={held} onPress={() => addHeld(h.name)} activeOpacity={0.7}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hitName}>{h.name}</Text>
                  {h.issuer ? <Text style={styles.hitIssuer}>{h.issuer}{h.state ? ` · ${h.state}` : ''}</Text> : null}
                </View>
                <Icon name={held ? 'f:check' : 'f:plus'} size={18} color={held ? Colors.slate : Colors.accentHi} />
              </TouchableOpacity>
            );
          }) : null}
          {typed.length >= 3 && !searching && !typedListed ? (
            <TouchableOpacity style={styles.hit} onPress={() => addHeld(typed)} activeOpacity={0.7}>
              <Text style={[styles.hitName, { flex: 1 }]}>{t('Add "{name}"', { name: typed })}</Text>
              <Icon name="f:plus" size={18} color={Colors.accentHi} />
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 12, marginTop: 60 },
  loadingText: { fontFamily: Fonts.regular, fontSize: 14, color: Colors.slate },
  card: { marginBottom: 10 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line },
  hitName: { fontFamily: Fonts.bold, fontSize: 15, color: Colors.text },
  hitIssuer: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.slate, marginTop: 2 },
  section: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.slate, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 8 },
  name: { fontFamily: Fonts.bold, fontSize: 16, color: Colors.text },
  detail: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.slate, marginTop: 4, lineHeight: 18 },
  source: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.slate, marginTop: 6 },
  link: { color: Colors.accentHi, textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
});
