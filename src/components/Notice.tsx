import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';

type Tone = 'info' | 'accent' | 'success' | 'warning' | 'danger';

interface NoticeProps {
  children: React.ReactNode;
  tone?: Tone;
  /** Override the default icon for the tone */
  icon?: string;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

const TONES: Record<Tone, { color: string; bg: string; icon: string }> = {
  info: { color: Colors.slate, bg: 'rgba(147,174,221,0.08)', icon: 'f:info' },
  accent: { color: Colors.accentHi, bg: 'rgba(242,100,25,0.08)', icon: 'lightbulb-on-outline' },
  success: { color: Colors.positive, bg: 'rgba(34,197,94,0.08)', icon: 'shield-check-outline' },
  warning: { color: Colors.warning, bg: 'rgba(245,158,11,0.10)', icon: 'f:alert-triangle' },
  danger: { color: '#FF7A7A', bg: 'rgba(239,68,68,0.10)', icon: 'f:alert-circle' },
};

/** True when children are only text (strings, numbers, <Text>) — they must
 *  then be wrapped in one <Text>, or React Native refuses to render them. */
function isInline(children: React.ReactNode) {
  const parts = React.Children.toArray(children);
  return parts.length > 0 && parts.every((c) =>
    typeof c === 'string' || typeof c === 'number' || (React.isValidElement(c) && c.type === Text));
}

/** Callout with a coloured left rule — tips, trust messages, errors */
export default function Notice({ children, tone = 'info', icon, title, style }: NoticeProps) {
  const t = TONES[tone];
  return (
    <View style={[styles.box, { backgroundColor: t.bg }, style]}>
      <View style={[styles.rule, { backgroundColor: t.color }]} />
      <Icon name={icon ?? t.icon} size={18} color={t.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.title, { color: t.color }]}>{title}</Text> : null}
        {isInline(children) ? <Text style={styles.text}>{children}</Text> : children}
      </View>
    </View>
  );
}

export const noticeTextStyle = {
  fontSize: 13,
  fontFamily: Fonts.medium,
  color: Colors.textSoft,
  lineHeight: 19,
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: Radii.md,
    overflow: 'hidden',
    marginBottom: 12,
  },
  rule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  title: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  text: noticeTextStyle,
});
