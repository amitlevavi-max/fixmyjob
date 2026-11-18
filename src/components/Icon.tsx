import React from 'react';
import { StyleProp, TextStyle } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../theme';

/**
 * Line-icon wrapper used across the app (replaces emoji).
 *
 *  name="briefcase-outline" → MaterialCommunityIcons
 *  name="f:arrow-right"   → Feather (thin UI glyphs)
 */
interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Icon({ name, size = 22, color = Colors.text, style }: IconProps) {
  if (name.startsWith('f:')) {
    return <Feather name={name.slice(2) as any} size={size} color={color} style={style} />;
  }
  return <MaterialCommunityIcons name={name as any} size={size} color={color} style={style} />;
}
