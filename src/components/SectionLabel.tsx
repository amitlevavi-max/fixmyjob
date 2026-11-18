import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';

interface SectionLabelProps {
  children: React.ReactNode;
  icon?: string;
  color?: string;
}

/** "SKILLS ─────────────" — section divider label */
export default function SectionLabel({ children, icon, color = Colors.slate }: SectionLabelProps) {
  return (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text style={[styles.label, { color }]}>{children}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.line,
  },
});
