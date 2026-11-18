/**
 * Support — a short form (category + free text) opened from the Fix My Job
 * menu. Each submission is saved to the `support_requests` table.
 * Signed-in users reply-to = their account email; signed-out users type one.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Chip from '../components/Chip';
import TextField from '../components/TextField';
import Button from '../components/Button';
import Notice from '../components/Notice';
import SectionLabel from '../components/SectionLabel';
import { Headline } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { useAuthStore } from '../store/authStore';
import { SUPPORT_CATEGORIES, SupportCategory, sendSupportRequest } from '../lib/support';
import { t } from '../i18n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SupportScreen() {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);
  const accountEmail = user?.email ?? null;

  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const replyTo = accountEmail ?? email.trim();
  const emailOk = !!accountEmail || EMAIL_RE.test(email.trim());
  const canSend = !!category && message.trim().length >= 5 && emailOk && !sending;

  async function submit() {
    if (!canSend || !category) return;
    setSending(true);
    setError(null);
    const res = await sendSupportRequest({
      userId: user?.id ?? null,
      email: replyTo || null,
      category,
      message,
    });
    setSending(false);
    if (res.ok) setSent(true);
    else setError(res.error);
  }

  if (sent) {
    return (
      <Screen footer={<Button label={t('Done')} onPress={() => navigation.goBack()} />}>
        <TopBar onBack={() => navigation.goBack()} label={t('Support')} />
        <Headline accent={t('you')}>{t('Thank')}</Headline>
        <Notice tone="success" icon="f:check-circle" style={{ marginTop: 16 }}>
          {t('We got your message and will reply to {email}.', { email: replyTo })}
        </Notice>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label={t('Send')} onPress={submit} loading={sending} disabled={!canSend} />}>
      <TopBar onBack={() => navigation.goBack()} label={t('Support')} />
      <Headline accent={t('help?')}>{t('Need')}</Headline>
      <Text style={styles.lead}>{t('Tell us what\'s wrong or what you\'d like to know. A real person reads every message.')}</Text>

      <View style={{ marginTop: 20 }}>
        <SectionLabel>{t('What is it about?')}</SectionLabel>
        <View style={styles.chips}>
          {SUPPORT_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={t(c.label)}
              icon={c.icon}
              selected={category === c.id}
              onPress={() => setCategory(c.id)}
            />
          ))}
        </View>
      </View>

      <TextField
        label={t('Your message')}
        placeholder={category === 'incorrect_data'
          ? t('Which number or fact looks wrong, and on which screen?')
          : t('Describe it in your own words')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={4000}
        containerStyle={{ marginTop: 20 }}
      />

      {accountEmail ? (
        <Text style={styles.reply}>{t("We'll reply to {email}.", { email: accountEmail })}</Text>
      ) : (
        <TextField
          label={t('Your email (so we can reply)')}
          icon="f:mail"
          placeholder={t('you@example.com')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={{ marginTop: 16 }}
        />
      )}

      {error ? <Notice tone="danger" style={{ marginTop: 16 }}>{t(error)}</Notice> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: Fonts.regular, fontSize: 15, lineHeight: 21, color: Colors.textSoft, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reply: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, marginTop: 10 },
});
