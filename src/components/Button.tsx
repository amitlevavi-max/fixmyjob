import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';
import Icon from './Icon';
import { Colors, Fonts, Radii, Shadows } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * primary / accent – safety-orange pill (main CTA)
   * secondary / outline – dark pill with a light outline
   * success / danger – semantic
   * blue – indigo pill (secondary positive actions)
   */
  variant?: 'primary' | 'accent' | 'secondary' | 'outline' | 'success' | 'danger' | 'blue';
  size?: 'md' | 'sm';
  /** Icon on the left, e.g. "google" or "f:share-2" */
  icon?: string;
  style?: StyleProp<ViewStyle>;
  loading?: boolean;
  disabled?: boolean;
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  style,
  loading,
  disabled,
}: ButtonProps) {
  // A trailing arrow in the label is rendered as a real icon
  const hasArrow = /\s*→\s*$/.test(label);
  const text = label.replace(/\s*→\s*$/, '');

  const v = VARIANTS[variant] ?? VARIANTS.primary;
  const isOff = disabled || loading;

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        size === 'sm' && styles.sm,
        { backgroundColor: v.bg, borderColor: v.border },
        v.glow && !isOff && Shadows.glow,
        isOff && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isOff}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={v.fg} /> : null}
          <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: v.fg }]}>{text}</Text>
          {hasArrow ? <Icon name="f:arrow-right" size={size === 'sm' ? 16 : 19} color={v.fg} /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const VARIANTS: Record<string, { bg: string; fg: string; border: string; glow?: boolean }> = {
  primary: { bg: Colors.accent, fg: '#FFFFFF', border: Colors.accent, glow: true },
  accent: { bg: Colors.accent, fg: '#FFFFFF', border: Colors.accent, glow: true },
  secondary: { bg: 'rgba(10,22,40,0.75)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.55)' },
  outline: { bg: 'rgba(10,22,40,0.75)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.55)' },
  success: { bg: Colors.positive, fg: '#06220F', border: Colors.positive },
  danger: { bg: Colors.danger, fg: '#FFFFFF', border: Colors.danger },
  blue: { bg: Colors.primary, fg: '#FFFFFF', border: Colors.primary },
};

const styles = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sm: {
    height: 42,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontSize: 17,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.2,
  },
  labelSm: {
    fontSize: 14,
  },
});
