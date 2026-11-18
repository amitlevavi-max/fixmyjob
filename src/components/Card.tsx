import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Radii } from '../theme';

interface CardProps {
  children: React.ReactNode;
  /**
   * default   – dark blueprint panel with a thin line border
   * raised    – lighter denim panel
   * accent    – orange outline + faint orange wash (selected / highlighted)
   * feature   – denim wash with an orange top rule (hero stats, summaries)
   * positive  – green outline (success / gains)
   */
  variant?: 'default' | 'raised' | 'accent' | 'feature' | 'positive';
  /** Blueprint corner ticks */
  ticks?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ children, variant = 'default', ticks, padded = true, style }: CardProps) {
  return (
    <View style={[styles.base, padded && styles.padded, VARIANTS[variant], style]}>
      {variant === 'feature' && <View style={styles.rule} />}
      {children}
      {ticks && (
        <>
          <View style={[styles.tick, { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[styles.tick, { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 }]} />
          <View style={[styles.tick, { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
          <View style={[styles.tick, { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 }]} />
        </>
      )}
    </View>
  );
}

const VARIANTS: Record<string, ViewStyle> = {
  default: {},
  raised: { backgroundColor: Colors.cardRaised },
  accent: { borderColor: Colors.accentLine, backgroundColor: 'rgba(242,100,25,0.08)' },
  feature: { backgroundColor: 'rgba(36,67,138,0.55)', borderColor: Colors.lineStrong, overflow: 'hidden' },
  positive: { borderColor: 'rgba(34,197,94,0.5)', backgroundColor: 'rgba(34,197,94,0.07)' },
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    marginBottom: 12,
  },
  padded: {
    padding: 16,
  },
  rule: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.accent,
  },
  tick: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderColor: Colors.accent,
  },
});
