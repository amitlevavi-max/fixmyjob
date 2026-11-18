import React from 'react';
import { Text, View, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

// ── Headline ────────────────────────────────────────────────────────────────
// Uppercase Barlow Condensed display type. The optional `accent` part is set
// in safety orange — e.g. <Headline accent={t('calculated.')}>{t('Your next move,')}</Headline>
interface HeadlineProps {
  children?: React.ReactNode;
  accent?: string;
  /** Put the accent on its own line */
  accentBreak?: boolean;
  size?: 'xl' | 'lg' | 'md' | 'sm';
  align?: 'left' | 'center';
  style?: StyleProp<TextStyle>;
}

const HEADLINE_SIZES = {
  xl: { fontSize: 46, lineHeight: 46 },
  lg: { fontSize: 36, lineHeight: 37 },
  md: { fontSize: 30, lineHeight: 31 },
  sm: { fontSize: 22, lineHeight: 24 },
};

export function Headline({ children, accent, accentBreak, size = 'lg', align = 'left', style }: HeadlineProps) {
  return (
    <Text style={[styles.headline, HEADLINE_SIZES[size], { textAlign: align }, style]}>
      {children}
      {accent ? (
        <Text style={styles.accent}>
          {children ? (accentBreak ? '\n' : ' ') : ''}
          {accent}
        </Text>
      ) : null}
    </Text>
  );
}

// ── Eyebrow ─────────────────────────────────────────────────────────────────
// Small spaced-out label that sits above a headline: "── INSIGHT 1 OF 3"
interface EyebrowProps {
  children: React.ReactNode;
  color?: string;
  align?: 'left' | 'center';
  style?: StyleProp<TextStyle>;
}

export function Eyebrow({ children, color = Colors.accentHi, align = 'left', style }: EyebrowProps) {
  return (
    <View style={[styles.eyebrowRow, align === 'center' && { justifyContent: 'center' }]}>
      <View style={[styles.eyebrowTick, { backgroundColor: color }]} />
      <Text style={[styles.eyebrow, { color }, style]}>{children}</Text>
    </View>
  );
}

// ── Lead / body copy ────────────────────────────────────────────────────────
interface LeadProps {
  children: React.ReactNode;
  align?: 'left' | 'center';
  style?: StyleProp<TextStyle>;
}

export function Lead({ children, align = 'left', style }: LeadProps) {
  return <Text style={[styles.lead, { textAlign: align }, style]}>{children}</Text>;
}

/** Inline emphasis for use inside <Lead> or other text */
export function Em({ children, color = Colors.accentHi }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontFamily: Fonts.bold, color }}>{children}</Text>;
}

const styles = StyleSheet.create({
  headline: {
    fontFamily: Fonts.display,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    marginBottom: 10,
  },
  accent: {
    color: Colors.accent,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  eyebrowTick: {
    width: 16,
    height: 2,
    borderRadius: 1,
  },
  eyebrow: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  lead: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.muted,
    marginBottom: 20,
  },
});
