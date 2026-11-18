import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

interface StepperProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Shown under the label, e.g. "Default: 40 (full time)" */
  hint?: string;
  /** Marks the value as the default (shows a small DEFAULT tag) */
  isDefault?: boolean;
  format?: (v: number) => string;
}

/** Label on the left, − value + on the right. */
export default function Stepper({
  label, value, onChange, min = 0, max = 100, step = 1, hint, isDefault, format,
}: StepperProps) {
  const dec = () => onChange(Math.max(min, +(value - step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value + step).toFixed(2)));
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {isDefault && <Text style={styles.tag}>{t('DEFAULT')}</Text>}
        </View>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={styles.control}>
        <TouchableOpacity
          onPress={dec}
          disabled={value <= min}
          style={[styles.btn, value <= min && styles.btnOff]}
          hitSlop={6}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Icon name="f:minus" size={16} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.value}>{format ? format(value) : value}</Text>
        <TouchableOpacity
          onPress={inc}
          disabled={value >= max}
          style={[styles.btn, value >= max && styles.btnOff]}
          hitSlop={6}
          accessibilityLabel={`Increase ${label}`}
        >
          <Icon name="f:plus" size={16} color={Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  tag: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    letterSpacing: 1,
    color: Colors.slate,
    borderWidth: 1,
    borderColor: Colors.line,
    borderRadius: Radii.xs,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hint: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.card,
  },
  btnOff: { opacity: 0.35 },
  value: { minWidth: 46, textAlign: 'center', fontSize: 20, fontFamily: Fonts.displayBold, color: Colors.text },
});
