import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, ActivityIndicator } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading icon when not selected (a check replaces it when selected) */
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Colour when selected: orange (a choice) or green (something you have) */
  tone?: 'accent' | 'positive';
}

export default function Chip({ label, selected, onPress, icon, loading, disabled, tone = 'accent' }: ChipProps) {
  const positive = tone === 'positive';
  return (
    <TouchableOpacity
      style={[styles.chip, selected && (positive ? styles.selectedPositive : styles.selected)]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={disabled || !onPress}
      accessibilityState={{ selected: !!selected }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.accentHi} style={styles.lead} />
      ) : selected ? (
        <View style={styles.lead}><Icon name="f:check" size={14} color={positive ? POSITIVE_TEXT : '#fff'} /></View>
      ) : icon ? (
        <View style={styles.lead}><Icon name={icon} size={14} color={Colors.slate} /></View>
      ) : null}
      <Text style={[styles.label, selected && (positive ? styles.selectedPositiveLabel : styles.selectedLabel)]}>{label}</Text>
    </TouchableOpacity>
  );
}

const POSITIVE_TEXT = '#06220F';   // dark green text on the green chip (same as the success button)

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radii.pill,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    marginRight: 8,
    marginBottom: 8,
  },
  selected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  lead: {
    width: 16,
    height: 16,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.textSoft,
  },
  selectedLabel: {
    color: '#fff',
  },
  selectedPositive: {
    backgroundColor: Colors.positive,
    borderColor: Colors.positive,
  },
  selectedPositiveLabel: {
    color: POSITIVE_TEXT,
  },
});
