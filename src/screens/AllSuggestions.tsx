/**
 * Every suggestion we've made, with filters: In my plan · To review · Not for me.
 * Each row shows status, the user's usefulness rating and when they decided;
 * tapping opens the opportunity, where the decision can be changed.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { usePlanView } from '../lib/planView';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Icon from '../components/Icon';
import { Headline } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t, isSpanish } from '../i18n';
import MoveTag from '../components/MoveTag';
import CosFlagTag from '../components/CosFlagTag';

type Nav = StackNavigationProp<RootStackParamList>;
type Filter = 'all' | 'in_plan' | 'pending' | 'not_pursuing';
const RATING: Record<string, string> = { very: '👍 Very useful', somewhat: '😐 Somewhat useful', not: '👎 Not useful' };
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(isSpanish() ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }) : '');

export default function AllSuggestionsScreen() {
  const navigation = useNavigation<Nav>();
  const { planDecisions, planMeta } = useUserStore();
  const v = usePlanView();
  const [filter, setFilter] = useState<Filter>('all');

  const status = (id: string): Filter => (planDecisions[id] as Filter) ?? 'pending';
  const rows = v.everything.filter((o) => filter === 'all' || status(o.id) === filter);
  const count = (f: Filter) => v.everything.filter((o) => status(o.id) === f).length;

  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} label={t('All suggestions')} />
      <Headline accent={t('suggestions')}>{t('All')}</Headline>
      <View style={styles.filters}>
        <Chip label={t('All ({n})', { n: v.everything.length })} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={t('In my plan ({n})', { n: count('in_plan') })} selected={filter === 'in_plan'} onPress={() => setFilter('in_plan')} />
        <Chip label={t('To review ({n})', { n: count('pending') })} selected={filter === 'pending'} onPress={() => setFilter('pending')} />
        <Chip label={t('Not for me ({n})', { n: count('not_pursuing') })} selected={filter === 'not_pursuing'} onPress={() => setFilter('not_pursuing')} />
      </View>

      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('Nothing here.')}</Text>
      ) : (
        <Card padded={false}>
          {rows.map((o, i) => {
            const st = status(o.id);
            const meta = planMeta[o.id] ?? {};
            const bits = [
              t(st === 'in_plan' ? 'In my plan' : st === 'not_pursuing' ? 'Not for me' : 'To review'),
              meta.decidedAt && st !== 'pending' ? t('decided {date}', { date: day(meta.decidedAt) }) : null,
              meta.rating ? t(RATING[meta.rating]) : null,
              st === 'not_pursuing' && meta.reason ? t(meta.reason) : null,
            ].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                key={o.id}
                style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => navigation.navigate('NextSteps', { opportunityId: o.id })}
                activeOpacity={0.75}
              >
                <Icon
                  name={st === 'in_plan' ? 'f:check-circle' : st === 'not_pursuing' ? 'f:x-circle' : 'f:circle'}
                  size={16}
                  color={st === 'in_plan' ? Colors.positive : st === 'not_pursuing' ? Colors.slate : Colors.accentHi}
                />
                <View style={{ flex: 1 }}>
                  <MoveTag opp={o} />
                  <CosFlagTag opp={o} />
                  <Text style={styles.title}>{v.titleOf(o)}</Text>
                  {o.teaser ? <Text style={styles.sub}>{o.teaser}</Text> : null}
                  <Text style={styles.sub}>{bits}</Text>
                  {!v.isSuggested(o) ? <Text style={styles.stale}>{t('No longer suggested for your profile')}</Text> : null}
                </View>
                <Icon name="f:chevron-right" size={16} color={Colors.slate} />
              </TouchableOpacity>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  empty: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line,
  },
  title: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  sub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2 },
  stale: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.warning, marginTop: 2 },
});
