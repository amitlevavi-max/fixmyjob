/**
 * Small label that tells a promotion ("Move up") from a career change, so the
 * two kinds of career moves are never confused (2026-10-26, Amit).
 * Renders nothing for other items.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import type { Opportunity } from '../data/opportunityCatalog';

export type MoveKind = 'move_up' | 'career_change';

export function moveKindOf(o: Pick<Opportunity, 'exclusiveGroup'>): MoveKind | null {
  if (o.exclusiveGroup === 'promotion') return 'move_up';
  if (o.exclusiveGroup === 'career_change') return 'career_change';
  return null;
}

export default function MoveTag({ opp, style }: { opp: Opportunity; style?: object }) {
  const kind = moveKindOf(opp);
  if (!kind) return null;
  const up = kind === 'move_up';
  const color = up ? Colors.positive : Colors.primaryOnDark;
  const label = up
    ? opp.isManager ? `${t('MOVE UP')} · ${t('MANAGER JOB')}` : t('MOVE UP')
    : t('CAREER CHANGE');
  return (
    <View style={[styles.tag, { borderColor: color }, style]}>
      <Icon name={up ? 'f:trending-up' : 'f:shuffle'} size={11} color={color} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginBottom: 4,
  },
  text: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1 },
});
