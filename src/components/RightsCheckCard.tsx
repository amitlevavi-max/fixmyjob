/**
 * Where I stand — the Claim my rights card (spec section 2):
 *   - "You may be owed at least $X a year" (confirmed amounts only)
 *   - Rights checked: a bar of owed / need answers / looks fine / not by law
 *   - "Answer N questions to check M more" → the first right still to check
 *   - Your hourly rate vs the legal minimum
 *   - One row per right (information only, no taps)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useRightsCheck, type RightStatus } from '../lib/rightsCheck';
import Card from './Card';
import Button from './Button';
import SectionLabel from './SectionLabel';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export const STATUS_COLOR: Record<RightStatus, string> = {
  owed: Colors.danger,
  check: Colors.warning,
  fine: Colors.positive,
  not_required: 'rgba(147,174,221,0.45)',
  na: 'transparent',
};

export default function RightsCheckCard() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const r = useRightsCheck();
  if (!r.active || r.rights.length === 0) return null;
  const { counts, owedTotal, mw } = r;
  const firstOwed = r.rights.find((x) => x.status === 'owed');
  const wageCovered = r.rights.some((x) => x.id === 'minimum_wage');
  const order: RightStatus[] = ['owed', 'check', 'fine', 'not_required'];
  const rows = [...r.rights].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || b.yearly - a.yearly);

  // Rate vs minimum: a line from 70% of the minimum to 130% of the higher of the two
  const rate = mw.baseHourly;
  const lo = mw.minimum.rate * 0.7;
  const hi = Math.max(rate, mw.minimum.rate) * 1.3;
  const pos = (v: number) => `${Math.min(96, Math.max(4, ((v - lo) / (hi - lo)) * 100))}%` as const;

  return (
    <View>
      <SectionLabel icon="f:shield">{t('Your rights at work')}</SectionLabel>
      <Card variant="feature" ticks>
        <Text style={styles.kicker}>{t(counts.owed ? 'YOU MAY BE OWED' : 'SO FAR')}</Text>
        {owedTotal > 0 ? (
          <Text style={styles.big}>{t('at least {amount} a year', { amount: money(owedTotal) })}</Text>
        ) : counts.owed > 0 ? (
          <Text style={styles.big}>{counts.owed === 1 ? t('1 right to claim') : t('{n} rights to claim', { n: counts.owed })}</Text>
        ) : (
          <Text style={styles.bigQuiet}>{t('What we’ve checked looks right')}</Text>
        )}
        {firstOwed ? <Text style={styles.why}>{firstOwed.why}</Text> : null}

        {/* Rights checked */}
        <Text style={styles.label}>{t('Rights checked: {n}', { n: counts.total })}</Text>
        <View style={styles.bar}>
          {order.map((s) => {
            const n = s === 'owed' ? counts.owed : s === 'check' ? counts.check : s === 'fine' ? counts.fine : counts.notRequired;
            return n > 0 ? <View key={s} style={{ flex: n, backgroundColor: STATUS_COLOR[s] }} /> : null;
          })}
        </View>
        <Text style={styles.legend}>
          {[
            counts.owed && t('{n} owed', { n: counts.owed }),
            counts.check && t('{n} need answers', { n: counts.check }),
            counts.fine && t('{n} fine', { n: counts.fine }),
            counts.notRequired && t('{n} not required by law', { n: counts.notRequired }),
          ].filter(Boolean).join(' · ')}
        </Text>
        {/* Your hourly rate vs the legal minimum */}
        {wageCovered && rate > 0 && (
          <>
            <Text style={styles.label}>{t('Your hourly rate vs the legal minimum')}</Text>
            <View style={styles.track}>
              <View style={styles.baseLine} />
              <View style={[styles.minLine, { left: pos(mw.minimum.rate) }]} />
              <View style={[styles.youDot, { left: pos(rate), backgroundColor: rate < mw.minimum.rate ? Colors.danger : Colors.positive }]} />
            </View>
            <View style={styles.rateRow}>
              <Text style={styles.rateText}>{t('You: {pay}/hr', { pay: `$${rate.toFixed(2)}` })}</Text>
              <Text style={[styles.rateText, { color: Colors.danger }]}>{t('Legal minimum: {min}/hr', { min: `$${mw.minimum.rate.toFixed(2)}` })}</Text>
            </View>
          </>
        )}
        {r.firstToCheck && (
          <View style={{ marginTop: 10 }}>
            <Button
              size="sm"
              variant="outline"
              label={r.questionsLeft > 0
                ? t('Answer {q} questions to check {m} more', { q: r.questionsLeft, m: counts.check })
                : t('Check {m} more', { m: counts.check })}
              onPress={() => navigation.navigate('NextSteps', { opportunityId: `right:${r.firstToCheck!.id}`, goal: 'claim_rights' })}
            />
          </View>
        )}
      </Card>

      {/* One row per right — information only */}
      <Card>
        {rows.map((x) => (
          <View key={x.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[x.status] }]} />
            <Text style={styles.rowName} numberOfLines={1}>{x.name}</Text>
            <Text style={[styles.rowValue, x.status === 'owed' && styles.rowOwed]}>
              {x.status === 'owed'
                ? x.yearly > 0 ? `+${money(x.yearly)}` : t('May be owed')
                : x.status === 'check' ? '?'
                : x.status === 'fine' ? t('Looks fine')
                : t('Not required by law')}
            </Text>
          </View>
        ))}
        <Text style={styles.note}>
          {t('Based on state and federal labor law and your answers. "May be owed" is information, not legal advice.')}
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: Fonts.bold, fontSize: 11, letterSpacing: 1, color: Colors.slate },
  big: { fontFamily: Fonts.bold, fontSize: 26, color: Colors.text, marginTop: 4 },
  bigQuiet: { fontFamily: Fonts.bold, fontSize: 20, color: Colors.text, marginTop: 4 },
  why: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.muted, marginTop: 6, lineHeight: 18 },
  label: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.text, marginTop: 14, marginBottom: 8 },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  legend: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.slate, marginTop: 6 },
  track: { height: 24, justifyContent: 'center', marginHorizontal: 4 },
  baseLine: { height: 2, backgroundColor: Colors.line, borderRadius: 1 },
  minLine: { position: 'absolute', width: 2, height: 24, backgroundColor: Colors.danger },
  youDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7, top: 5 },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rateText: { fontFamily: Fonts.regular, fontSize: 12, color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { flex: 1, fontFamily: Fonts.regular, fontSize: 14, color: Colors.text },
  rowValue: { fontFamily: Fonts.regular, fontSize: 13, color: Colors.slate },
  rowOwed: { fontFamily: Fonts.bold, color: Colors.text },
  note: { fontFamily: Fonts.regular, fontSize: 11, color: Colors.slate, marginTop: 8, lineHeight: 15 },
});
