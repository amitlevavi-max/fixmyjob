import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

interface LogoProps {
  size?: 'lg' | 'md' | 'sm';
  tagline?: boolean;
  /** Stack the mark above the wordmark (centered layouts) */
  stacked?: boolean;
}

// The official app icon (orange tile, "F" + worker-with-wrench mark).
// Same artwork as the launcher icon and splash screen.
const MARK = require('../../assets/logo.png');

const SIZES = {
  lg: { mark: 56, word: 34, tag: 11 },
  md: { mark: 46, word: 28, tag: 10 },
  sm: { mark: 32, word: 20, tag: 8 },
};

/** App-icon mark + FIX MY JOB wordmark */
export default function Logo({ size = 'lg', tagline = false, stacked }: LogoProps) {
  const s = SIZES[size];
  return (
    <View style={[styles.row, stacked && styles.stacked]}>
      <Image
        source={MARK}
        style={{ width: s.mark, height: s.mark }}
        resizeMode="contain"
        accessibilityLabel={t('Fix My Job logo')}
      />
      <View style={stacked && { alignItems: 'center' }}>
        <Text style={[styles.word, { fontSize: s.word, lineHeight: s.word * 1.05 }]}>
          {t('FIX MY')} <Text style={{ color: Colors.accent }}>{t('JOB')}</Text>
        </Text>
        {tagline && (
          <Text style={[styles.tag, { fontSize: s.tag }]}>{t('REAL PEOPLE. BETTER MOVES.')}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stacked: {
    flexDirection: 'column',
    gap: 12,
  },
  word: {
    color: Colors.text,
    fontFamily: Fonts.display,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  tag: {
    color: Colors.textSoft,
    fontFamily: Fonts.semiBold,
    letterSpacing: 1.4,
    marginTop: 3,
  },
});
