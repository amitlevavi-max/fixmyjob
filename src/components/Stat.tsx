import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Colors, Fonts } from '../theme';

interface StatProps {
  value: string;
  label?: string;
  /** Small suffix set lighter next to the number, e.g. "/yr" or "th" */
  suffix?: string;
  color?: string;
  size?: 'xl' | 'lg' | 'md';
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}

const SIZES = { xl: 72, lg: 44, md: 30 };

/** Big tabular Barlow Condensed number with a caption */
export default function Stat({
  value,
  label,
  suffix,
  color = Colors.text,
  size = 'lg',
  align = 'left',
  style,
}: StatProps) {
  const fs = SIZES[size];
  return (
    <View style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}>
      {/* Never wrap a number: shrink it to fit the space instead */}
      <Text
        style={[styles.value, { fontSize: fs, lineHeight: fs * 1.02, color }, align === 'center' ? null : styles.full]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.5}
      >
        {value}
        {suffix ? <Text style={[styles.suffix, { fontSize: fs * 0.42 }]}>{suffix}</Text> : null}
      </Text>
      {label ? <Text style={[styles.label, { textAlign: align }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  value: {
    fontFamily: Fonts.displayBlack,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  suffix: {
    fontFamily: Fonts.displayBold,
    color: Colors.slate,
    letterSpacing: 0,
  },
  label: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    color: Colors.slate,
    marginTop: 4,
  },
});
