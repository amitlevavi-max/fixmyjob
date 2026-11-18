import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useAuthStore } from '../store/authStore';
import { queueProfileSave } from '../lib/profileSync';
import { logFeatureInterest } from '../lib/featureInterest';
import { backToProfile } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import IconTile from '../components/IconTile';
import Icon from '../components/Icon';
import TextField from '../components/TextField';
import Notice from '../components/Notice';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'JobOfferOptIn'>;

/**
 * Job offers aren't built yet (Amit, 2026-10-27): the screen explains the two
 * promises, a "yes" is saved and logged (feature_interest 'job_offers'), and
 * the user is told it's coming soon.
 */
const HIGHLIGHTS = [
  {
    icon: 'incognito',
    title: 'Anonymous',
    text: 'Employers see your work history and skills, but not your name or how to reach you. You look at each offer and decide who gets to know who you are.',
  },
  {
    icon: 'tune-variant',
    title: 'Only offers that fit you',
    text: "Every offer we pass on fits what you're after: pay, commute, job title and more.",
  },
];

export default function JobOfferOptInScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'JobOfferOptIn'>>().params?.edit;
  const { setWantsJobOffers, setProfile, profile } = useUserStore();
  const accountEmail = useAuthStore((s) => s.user?.email) ?? '';
  // Pre-fill with the email we already have; only show the box if there's none or they tap Change
  const [email, setEmail] = useState(profile.email || accountEmail);
  const [editingEmail, setEditingEmail] = useState(!(profile.email || accountEmail));
  const [optedIn, setOptedIn] = useState(false);

  function handleOptIn() {
    setWantsJobOffers(true);
    const contact = email.trim();
    if (contact) setProfile({ email: contact });
    // Saved to the account (user_profiles) so we can follow up, and counted as demand for the feature
    queueProfileSave({ job_offer_email: contact || null, job_offers_opted_at: new Date().toISOString() }, true);
    logFeatureInterest('job_offers', 'job_offer_opt_in', editing ? 'edit' : 'onboarding');
    setOptedIn(true);
  }

  function handleDone() {
    if (editing) backToProfile(navigation, 'Job offers');
    else navigation.navigate('Share');
  }

  function handleSkip() {
    setWantsJobOffers(false);
    if (editing) backToProfile(navigation, 'Job offers');
    else navigation.navigate('Share');
  }

  if (optedIn) {
    return (
      <Screen scrollable={false} cornerMarks footer={<Button label={t('Done')} onPress={handleDone} />}>
        <View style={styles.center}>
          <IconTile icon="clock-fast" tone="solid" size={76} />
          <Headline align="center" accent={t('Coming soon')} accentBreak>{t('Job offers are')}</Headline>
          <Lead align="center">
            {email.trim()
              ? t("We're building this now. You're on the list — we'll write to {email} as soon as it's ready.", { email: email.trim() })
              : t("We're building this now. You're on the list — we'll let you know as soon as it's ready.")}
          </Lead>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button label={t('Yes, send me job offers →')} onPress={handleOptIn} />
          <GhostButton label={t(editing ? 'No thanks — turn off' : 'Maybe later')} onPress={handleSkip} />
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label={t('Job matches')} />

      <Eyebrow>{t('No job-board scrolling')}</Eyebrow>
      <Headline accent={t('come to you?')}>{t('Want job offers to')}</Headline>
      <Lead>{t('Employers send you offers. You stay in control.')}</Lead>

      {HIGHLIGHTS.map((h) => (
        <Card key={h.icon} variant="accent" style={styles.highlight}>
          <View style={styles.highlightHead}>
            <IconTile icon={h.icon} size={42} tone="accent" />
            <Text style={styles.highlightTitle}>{t(h.title)}</Text>
          </View>
          <Text style={styles.highlightText}>{t(h.text)}</Text>
        </Card>
      ))}

      {editingEmail ? (
        <TextField
          label={t('Where should we tell you when it is ready?')}
          icon="f:mail"
          placeholder={t('your@email.com')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!!(profile.email || accountEmail)}
          containerStyle={{ marginTop: 6, marginBottom: 14 }}
        />
      ) : (
        <View style={styles.emailBlock}>
          <Text style={styles.emailLabel}>{t('WE WILL WRITE TO')}</Text>
          <View style={styles.emailRow}>
            <Icon name="f:mail" size={18} color={Colors.slate} />
            <Text style={styles.emailText} numberOfLines={1}>{email}</Text>
            <TouchableOpacity onPress={() => setEditingEmail(true)} hitSlop={10}>
              <Text style={styles.change}>{t('Change')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Notice tone="info" icon="f:clock">
        {t('Job offers are coming soon. Say yes now and you will be among the first to get them.')}
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  highlight: { marginBottom: 10 },
  highlightHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  highlightTitle: { flex: 1, fontSize: 19, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  highlightText: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 8 },
  emailBlock: { marginTop: 6, marginBottom: 14 },
  emailLabel: { fontSize: 12, fontFamily: Fonts.bold, letterSpacing: 1.2, color: Colors.slate, marginBottom: 8 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: Colors.line, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  emailText: { flex: 1, fontSize: 16, fontFamily: Fonts.medium, color: Colors.text },
  change: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.accentHi },
});
