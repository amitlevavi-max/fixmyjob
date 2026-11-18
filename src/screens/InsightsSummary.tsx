import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goTab } from '../lib/nav';
import { useUserStore } from '../store/userStore';
import { useOpportunities } from '../lib/useOpportunities';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import KVRow from '../components/KVRow';
import Stat from '../components/Stat';
import IconTile from '../components/IconTile';
import SectionLabel from '../components/SectionLabel';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';
import { formatYears } from '../lib/format';

type Nav = StackNavigationProp<RootStackParamList, 'InsightsSummary'>;

const GOAL_LABELS: Record<string, string> = {
  earn_more: 'Earn more money',
  rise_up: 'Get promoted',
  work_life_balance: 'Better work-life balance',
  change_careers: 'Change careers',
  claim_rights: 'Claim my rights',
  less_physical: 'Less physical work',
};

const FOUND = (n: number) => [
  { icon: 'briefcase-outline', text: n === 1 ? t('1 opportunity tailored to your goal') : t('{n} opportunities tailored to your goal', { n }) },
  { icon: 'chart-timeline-variant', text: 'Clear steps with timelines for each' },
  { icon: 'target', text: 'Ranked by potential earning gain' },
];

export default function InsightsSummaryScreen() {
  const navigation = useNavigation<Nav>();
  const { focusGoal: goal, profile, earningsPercentile } = useUserStore();

  const percentile = earningsPercentile;   // no made-up default
  // Same opportunities & numbers the next screen shows, combined sensibly
  const { opportunities, boost } = useOpportunities();
  const potentialUplift = Math.round(boost.total / 100) * 100;

  return (
    <Screen
      footer={
        <Button
          label={t(opportunities.length ? 'See my opportunities →' : 'No opportunities to show yet')}
          disabled={!opportunities.length}
          onPress={() => goTab(navigation, 'Plan')}
        />
      }
    >
      <TopBar onBack={() => navigation.goBack()} label={t('Your report')} />

      <Eyebrow>{t('Your Fix My Job report')}</Eyebrow>
      <Headline accent={t('picture')}>{t('Here\'s the')}</Headline>
      <Lead>{t('Based on your profile, here are the key facts — then your personalised moves.')}</Lead>

      <Card variant="feature" ticks>
        <View style={styles.stats}>
          <Stat value={percentile != null ? `${percentile}` : '—'} suffix={percentile != null ? 'th %ile' : undefined} label={t('Earnings rank')} size="lg" style={{ flex: 0.8 }} />
          <View style={styles.divider} />
          <Stat
            value={`+$${potentialUplift.toLocaleString()}`}
            label={t('Potential boost / yr')}
            size="lg"
            color={Colors.positive}
            style={{ flex: 1.2 }}
          />
        </View>
        {boost.parts.length > 0 && (
          <View style={styles.breakdown}>
            <Text style={styles.breakdownTitle}>{t('HOW WE GOT THIS')}</Text>
            {boost.parts.map((p) => (
              <View key={p.label} style={styles.partRow}>
                <Text style={styles.partLabel} numberOfLines={2}>{p.label}</Text>
                <Text style={styles.partValue}>+${p.amount.toLocaleString()}</Text>
              </View>
            ))}
            {boost.parts.some((p) => p.note) && (
              <Text style={styles.partNote}>
                {t('Career moves are alternatives, so only the best one is counted. One-off back pay isn\'t included.')}
              </Text>
            )}
          </View>
        )}
      </Card>

      <Card>
        <KVRow label={t('Your goal')} value={t(GOAL_LABELS[goal || 'earn_more'] || 'Earn more money')} />
        <KVRow label={t('Current role')} value={profile.role || t('Not set')} muted={!profile.role} />
        <KVRow
          last
          label={t('Experience')}
          value={profile.yearsExperience ? formatYears(profile.yearsExperience) : t('Not set')}
          muted={!profile.yearsExperience}
        />
      </Card>

      <SectionLabel>{t('What we found for you')}</SectionLabel>
      <View style={styles.found}>
        {FOUND(opportunities.length).map((f) => (
          <View key={f.icon} style={styles.foundRow}>
            <IconTile icon={f.icon} size={40} tone="accent" />
            <Text style={styles.foundText}>{t(f.text)}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 6 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.line },
  breakdown: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.line, gap: 6 },
  breakdownTitle: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1.4, color: Colors.slate, marginBottom: 2 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  partLabel: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSoft },
  partValue: { fontSize: 16, fontFamily: Fonts.displayBold, color: Colors.positive },
  partNote: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 15, marginTop: 4 },
  found: { gap: 10 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  foundText: { flex: 1, fontSize: 15, fontFamily: Fonts.medium, color: Colors.text },
});
