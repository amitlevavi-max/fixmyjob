import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useUserStore } from '../../store/userStore';
import { useLocalWages, useOccupationForTitle } from '../../lib/useLocalWages';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import Card from '../../components/Card';
import KVRow from '../../components/KVRow';
import Icon from '../../components/Icon';
import Notice from '../../components/Notice';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { Colors, Fonts } from '../../theme';
import { t, isSpanish } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'NextLevelPay'>;

function formatWage(annual: number): string {
  if (annual >= 1000) return '$' + Math.round(annual / 1000) + 'k';
  return '$' + annual.toLocaleString();
}

export default function NextLevelPayScreen() {
  const navigation = useNavigation<Nav>();
  const {
    profile,
    matchedOccupation,
    targetCareerRole,
    targetCareerTitle,
    targetCareerWage,
  } = useUserStore();

  const currentEarnings = profile.annualEarnings ?? 0;
  const currentTitle = matchedOccupation?.title ? t(matchedOccupation.title) : profile.role ?? t('Your current role');
  const nextTitle = targetCareerTitle ?? targetCareerRole ?? t('Next level');
  // Look the suggested role up in BLS data and use wages where the user lives
  const { occupation: nextOcc, loading: matching } = useOccupationForTitle(targetCareerTitle ?? targetCareerRole);
  const local = useLocalWages(nextOcc?.soc ?? null);
  const nextWage = nextOcc && !local.loading ? Math.round(local.p50) : matching ? 0 : (targetCareerWage ?? 0);
  const gain = nextWage > 0 ? nextWage - currentEarnings : 0;
  const gainPct = currentEarnings > 0 && gain > 0
    ? Math.round((gain / currentEarnings) * 100)
    : 0;
  const monthlyGain = Math.round(gain / 12);

  return (
    <Screen
      footer={<Button label={t('See my opportunities →')} onPress={() => navigation.navigate('InsightsSummary')} />}
    >
      <TopBar onBack={() => navigation.goBack()} step={3} total={3} />

      <Eyebrow>{t('Seniority · Insight 3 of 3')}</Eyebrow>
      <Headline accent={nextTitle}>{t('What it pays:')}</Headline>
      <Lead>
        {nextOcc
          ? t('Typical (median) pay for {job} in {area}.', { job: isSpanish() ? t(nextOcc.title) : nextOcc.title.toLowerCase(), area: local.areaName })
          : t('Typical pay for this role, from official wage data.')}
      </Lead>

      {/* Now → Next comparison */}
      <Card variant="feature" ticks>
        <View style={styles.compare}>
          <View style={styles.col}>
            <Text style={styles.colTag}>{t('NOW')}</Text>
            <Text style={styles.colValue}>{currentEarnings > 0 ? formatWage(currentEarnings) : '—'}</Text>
            <Text style={styles.colTitle} numberOfLines={2}>{currentTitle}</Text>
          </View>

          <View style={styles.middle}>
            <View style={styles.arrowCircle}>
              <Icon name="f:arrow-right" size={18} color="#fff" />
            </View>
            {gain > 0 && <Text style={styles.uplift}>+{formatWage(gain)}</Text>}
          </View>

          <View style={styles.col}>
            <Text style={[styles.colTag, { color: Colors.positive }]}>{t('NEXT LEVEL')}</Text>
            <Text style={[styles.colValue, { color: Colors.positive }]}>
              {nextWage > 0 ? formatWage(nextWage) : '—'}
            </Text>
            <Text style={styles.colTitle} numberOfLines={2}>{nextTitle}</Text>
          </View>
        </View>
      </Card>

      {gain > 0 && (
        <Card>
          <KVRow label={t('Annual increase')} value={'+' + formatWage(gain)} valueColor={Colors.positive} last={!(monthlyGain > 0) && !(gainPct > 0)} />
          {monthlyGain > 0 && (
            <KVRow label={t('Per month')} value={'+' + formatWage(monthlyGain)} valueColor={Colors.positive} last={!(gainPct > 0)} />
          )}
          {gainPct > 0 && (
            <KVRow label={t('Pay increase')} value={`+${gainPct}%`} valueColor={Colors.positive} last />
          )}
        </Card>
      )}

      <Notice tone="accent" icon="f:message-square" title={t('Always negotiate')}>
        {t('Ask for more at the offer stage — the first number is often not the final one.')}
      </Notice>

      <Notice tone="info" icon="f:bar-chart-2">
        {nextOcc
          ? `${local.sourceLine}. ${t('Your actual offer will vary by employer and experience.')}`
          : t("We couldn't match this role to an official BLS occupation, so no local figure is shown. Your actual offer will vary by employer and experience.")}
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compare: { flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  col: { flex: 1, alignItems: 'center', gap: 2 },
  colTag: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.5, color: Colors.slate },
  colValue: { fontSize: 38, lineHeight: 42, fontFamily: Fonts.displayBlack, color: Colors.text },
  colTitle: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.textSoft, textAlign: 'center', lineHeight: 16 },
  middle: { alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uplift: { fontSize: 14, fontFamily: Fonts.displayBold, color: Colors.positive },
});
