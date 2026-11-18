import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Icon from './Icon';
import { Colors, Radii } from '../theme';

interface IconTileProps {
  icon: string;
  size?: number;
  /**
   * default  – outlined square, white line icon (as on the Welcome screen)
   * accent   – orange outline + orange icon
   * solid    – filled orange, white icon
   * positive – green outline + green icon
   */
  tone?: 'default' | 'accent' | 'solid' | 'positive';
  style?: StyleProp<ViewStyle>;
}

export default function IconTile({ icon, size = 46, tone = 'default', style }: IconTileProps) {
  const t = TONES[tone];
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: t.bg, borderColor: t.border },
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.52)} color={t.icon} />
    </View>
  );
}

const TONES = {
  default: { bg: 'rgba(10,22,40,0.75)', border: Colors.lineStrong, icon: Colors.text },
  accent: { bg: Colors.accentSoft, border: Colors.accentLine, icon: Colors.accentHi },
  solid: { bg: Colors.accent, border: Colors.accent, icon: '#FFFFFF' },
  positive: { bg: Colors.positiveSoft, border: 'rgba(34,197,94,0.5)', icon: Colors.positive },
};

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
