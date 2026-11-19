/**
 * What "In demand" / "Industry endorsed" means, on the item's screen (Amit, 2026-11-18), with the source
 * (CareerOneStop, U.S. Dept. of Labor) and when it was checked. Worded to what CareerOneStop actually says:
 * it publishes no posting counts or dates, so the text doesn't claim any.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import CosFlagTag from './CosFlagTag';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { cosFlagsOf, COS_SOURCE } from '../lib/cosFlags';
import type { Opportunity } from '../data/opportunityCatalog';

export default function CosFlagNote({ opp }: { opp: Opportunity }) {
  const f = cosFlagsOf(opp);
  if (!f) return null;
  const cert = f.credential ?? t('this certification');
  const checked = f.checkedAt ? new Date(f.checkedAt).toLocaleDateString() : null;
  // A course item: say which certification the course leads to
  const viaCourse = !opp.cosFlags && !!opp.course;
  return (
    <Card variant="accent" style={{ marginBottom: 12 }}>
      <CosFlagTag opp={opp} />
      {viaCourse ? <Text style={styles.text}>{t('This course prepares you for {cert}.', { cert })}</Text> : null}
      {f.inDemand ? (
        <Text style={styles.text}>
          <Text style={styles.bold}>{t('In demand')}: </Text>
          {t('CareerOneStop, from the U.S. Department of Labor, marks {cert} as in demand: employers often ask for it in online job postings.', { cert })}
        </Text>
      ) : null}
      {f.endorsed ? (
        <Text style={styles.text}>
          <Text style={styles.bold}>{t('Industry endorsed')}: </Text>
          {t('CareerOneStop, from the U.S. Department of Labor, marks {cert} as industry endorsed: a major industry association, not only the organization that issues it, recommends it.', { cert })}
        </Text>
      ) : null}
      <Text style={styles.source}>
        {t('Source: {source}', { source: COS_SOURCE })}{checked ? ` (${t('checked {date}', { date: checked })})` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.text, lineHeight: 20, marginTop: 6 },
  bold: { fontFamily: Fonts.bold },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 8 },
});
