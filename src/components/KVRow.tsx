import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';

interface KVRowProps {
  label: string;
  value: string;
  valueColor?: string;
  /** Hide the bottom rule (use on the last row inside a Card) */
  last?: boolean;
  /** Makes the row tappable and shows an edit pencil */
  onPress?: () => void;
  muted?: boolean;
}

/** Spec-sheet style row: LABEL ··········· Value */
export default function KVRow({ label, value, valueColor, last, onPress, muted }: KVRowProps) {
  const body = (
    <>
      <Text style={styles.key}>{label}</Text>
      <Text
        style={[styles.value, muted && styles.valueMuted, valueColor ? { color: valueColor } : null]}
        numberOfLines={2}
      >
        {value}
      </Text>
      {onPress ? <Icon name="f:edit-2" size={14} color={Colors.slate} style={{ marginLeft: 10 }} /> : null}
    </>
  );
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.row, last && styles.last]} onPress={onPress} activeOpacity={0.7}>
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.row, last && styles.last]}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    borderStyle: 'dashed',
  },
  last: {
    borderBottomWidth: 0,
  },
  key: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.bold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: Colors.slate,
  },
  value: {
    flex: 1.2,
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.text,
    textAlign: 'right',
  },
  valueMuted: {
    color: Colors.faint,
    fontFamily: Fonts.regular,
  },
});
