/**
 * Ask for the user's ZIP code (only when we need it — courses near them).
 * Turns it into a map point + closest city and saves it to the profile.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Card from './Card';
import Button from './Button';
import TextField from './TextField';
import { Colors, Fonts } from '../theme';
import { useUserStore } from '../store/userStore';
import { isZip, locateZip } from '../lib/home';
import { t } from '../i18n';

interface Props {
  /** Why we ask, e.g. "To find training near you" */
  reason?: string;
  /** Show a "skip" link (the caller then searches the whole state) */
  onSkip?: () => void;
  skipLabel?: string;
  compact?: boolean;
}

export default function ZipPrompt({ reason = 'To find training near you', onSkip, skipLabel = 'Skip', compact }: Props) {
  const { homePoint, setHome } = useUserStore();
  const [zip, setZip] = useState(homePoint?.zip ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!isZip(zip)) { setError('Enter a 5-digit ZIP code'); return; }
    setBusy(true); setError(null);
    try {
      const point = await locateZip(zip);
      if (!point) setError('We couldn\'t find that ZIP code — check the number?');
      else setHome(point);
    } catch {
      setError('Couldn\'t look that up right now — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant={compact ? 'default' : 'accent'}>
      <Text style={styles.title}>{t('What\'s your ZIP code?')}</Text>
      <Text style={styles.sub}>{`${t(reason)}. ${t('We only use it to work out distances and your closest city.')}`}</Text>
      <View style={styles.row}>
        <TextField
          icon="f:map-pin"
          placeholder={t('e.g. 75701')}
          value={zip}
          onChangeText={(t: string) => { setZip(t.replace(/\D/g, '').slice(0, 5)); setError(null); }}
          keyboardType="number-pad"
          returnKeyType="done"
          onSubmitEditing={save}
          containerStyle={{ flex: 1 }}
        />
        <Button label={busy ? '…' : t('Save')} size="sm" onPress={save} disabled={busy} />
      </View>
      {error ? <Text style={styles.error}>{t(error)}</Text> : null}
      {onSkip ? (
        <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
          <Text style={styles.skip}>{t(skipLabel)}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  sub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 19, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  error: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.danger, marginTop: 6 },
  skip: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentHi, marginTop: 10 },
});
