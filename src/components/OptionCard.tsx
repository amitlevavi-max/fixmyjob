import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import IconTile from './IconTile';
import Icon from './Icon';
import { Colors, Fonts, Radii } from '../theme';

interface OptionCardProps {
  title: string;
  subtitle?: string;
  icon?: string;
  selected?: boolean;
  onPress: () => void;
  /**
   * nav    – chevron on the right (navigates somewhere)
   * radio  – single choice
   * check  – multiple choice
   * none   – no trailing indicator
   */
  mode?: 'nav' | 'radio' | 'check' | 'none';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Selectable row: [icon tile] Title / subtitle  [indicator] */
export default function OptionCard({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  mode = 'radio',
  compact,
  style,
}: OptionCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, compact && styles.compact, selected && styles.selected, style]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      {icon ? <IconTile icon={icon} size={compact ? 38 : 44} tone={selected ? 'accent' : 'default'} /> : null}
      <View style={styles.text}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {mode === 'nav' && <Icon name="f:chevron-right" size={20} color={Colors.slate} />}
      {mode === 'radio' && (
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      )}
      {mode === 'check' && (
        <View style={[styles.checkbox, selected && styles.checkboxOn]}>
          {selected && <Icon name="f:check" size={14} color="#fff" />}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  compact: {
    paddingVertical: 10,
  },
  selected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(242,100,25,0.10)',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
    lineHeight: 21,
  },
  titleSelected: {
    color: '#FFFFFF',
    fontFamily: Fonts.bold,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: Colors.muted,
    lineHeight: 18,
    marginTop: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  radioOn: {
    borderColor: Colors.accent,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.accent,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  checkboxOn: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
});
