import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Fonts } from '../theme';

interface GhostButtonProps {
  label: string;
  onPress: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Low-emphasis text button ("Skip", "Maybe later") */
export default function GhostButton({ label, onPress, color, style }: GhostButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, style]} activeOpacity={0.7}>
      <Text style={[styles.label, color ? { color } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.slate,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(147,174,221,0.4)',
  },
});
