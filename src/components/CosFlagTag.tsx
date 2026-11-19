/**
 * "IN DEMAND" / "INDUSTRY ENDORSED" label on an item that is (or leads to) a certification CareerOneStop
 * flags (lib/cosFlags). Used in the plan lists next to the title and on the item's screen. Renders nothing
 * for other items. The highlight colour of the list row comes from cosRowStyle.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { cosFlagsOf } from '../lib/cosFlags';
import type { Opportunity } from '../data/opportunityCatalog';

export default function CosFlagTag({ opp, style }: { opp: Opportunity; style?: object }) {
  const f = cosFlagsOf(opp);
  if (!f) return null;
  return (
    <View style={[styles.wrap, style]}>
      {f.inDemand ? (
        <View style={styles.tag}>
          <Icon name="f:trending-up" size={11} color={Colors.text} />
          <Text style={styles.text}>{t('IN DEMAND')}</Text>
        </View>
      ) : null}
      {f.endorsed ? (
        <View style={styles.tag}>
          <Icon name="f:award" size={11} color={Colors.text} />
          <Text style={styles.text}>{t('INDUSTRY ENDORSED')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Orange highlight for a flagged item's row in a list */
export const cosRowStyle = {
  backgroundColor: Colors.accentSoft,
  borderLeftWidth: 3,
  borderLeftColor: Colors.accent,
  paddingLeft: 8,
  marginLeft: -8,
  borderRadius: 6,
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.accent, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  text: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.text },
});
