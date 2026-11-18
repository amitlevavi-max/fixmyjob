import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useUserStore } from '../../store/userStore';
import { tenureYears, formatMonths } from '../../lib/format';
import { useLocalWages, useOccupationForTitle } from '../../lib/useLocalWages';
import { useExperience } from '../../lib/experience';
import { knownOccupation, fetchOccupationBySoc } from '../../lib/occupationSearch';
import type { OccupationWages } from '../../data/blsOews';
import OccupationPicker from '../../components/OccupationPicker';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import Card from '../../components/Card';
import KVRow from '../../components/KVRow';
import Stat from '../../components/Stat';
import Notice from '../../components/Notice';
import SectionLabel from '../../components/SectionLabel';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { Colors, Fonts } from '../../theme';
import { supabase } from '../../lib/supabase';
import { t, tSource } from '../../i18n';
import { experienceLabel } from '../../lib/experience';

type Nav = StackNavigationProp<RootStackParamList, 'TimeToNextLevel'>;

interface CareerSuggestion {
  suggestedRole: string;
  typicalTenureYears: { min: number; max: number };
  tenureNote: string;
  medianWage?: number;   // not returned by ask-career; pay comes from BLS
  skills: string[];
  certifications: string[];
  timelineMonths: { min: number; max: number };
  timelineNote: string;
}

function formatWage(annual: number): string {
  if (!annual || isNaN(annual) || annual <= 0) return '—';
  return '$' + Math.round(annual / 1000) + 'k';
}

export default function TimeToNextLevelScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, matchedOccupation, setTargetCareer, targetCareerSoc } = useUserStore();

  // The user can replace the AI's suggestion with any BLS occupation
  const [picking, setPicking] = useState(false);
  const [pickSoc, setPickSoc] = useState<string | null>(null);
  const [pickText, setPickText] = useState('');
  const [pickedOcc, setPickedOcc] = useState<OccupationWages | null>(
    targetCareerSoc ? knownOccupation(targetCareerSoc) : null,
  );
  useEffect(() => {
    if (targetCareerSoc && !pickedOcc) fetchOccupationBySoc(targetCareerSoc).then((o) => o && setPickedOcc(o));
  }, [targetCareerSoc]);

  const currentRole = matchedOccupation?.title ?? profile.role ?? 'your current role';
  const currentEarnings = profile.annualEarnings ?? 0;
  const yearsIn = Math.round(tenureYears(profile) * 10) / 10;   // exact when months are known

  const [suggestion, setSuggestion] = useState<CareerSuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('ask-career', {
          body: { currentRole },
        });

        if (cancelled) return;

        if (fnError || !data) {
          setError(t("Couldn't load career suggestion — please try again."));
          setLoading(false);
          return;
        }

        const d = data as CareerSuggestion;
        setSuggestion(d);
        // Don't overwrite a next role the user picked themselves
        if (!useUserStore.getState().targetCareerSoc) setTargetCareer(d.suggestedRole, d.suggestedRole, 0);
      } catch {
        if (!cancelled) {
          setError(t('Network error — check your connection and try again.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole]);

  // Pay for the suggested role from BLS data where the user lives
  const { occupation: aiOcc } = useOccupationForTitle(suggestion?.suggestedRole);
  const nextOcc = pickedOcc ?? aiOcc;
  const nextTitle = pickedOcc?.title ?? suggestion?.suggestedRole ?? '';

  function choosePicked() {
    const occ = pickSoc ? knownOccupation(pickSoc) : null;
    if (occ) {
      setPickedOcc(occ);
      setTargetCareer(occ.title, occ.title, occ.p50, occ.soc);
    }
    setPicking(false);
  }
  const local = useLocalWages(nextOcc?.soc ?? null);
  const nextMedian = nextOcc && !local.loading ? Math.round(local.p50) : 0;
  const gain = nextMedian > 0 && currentEarnings > 0 ? nextMedian - currentEarnings : null;
  // Keep the next role's BLS pay for the opportunities built from it
  const setTargetCareerPay = useUserStore((st) => st.setTargetCareerPay);
  useEffect(() => {
    if (nextMedian > 0) setTargetCareerPay({ median: nextMedian, source: local.sourceLine, area: local.areaName, soc: nextOcc?.soc });
  }, [nextMedian, local.sourceLine, local.areaName, nextOcc?.soc]);

  // Experience usually needed for the next role — O*NET Related Work Experience
  const exp = useExperience(nextOcc?.soc);
  const e = exp.data;
  const need = e && !e.none ? e : null;
  const lo = need?.low ?? 0;
  const hi = need ? (need.high ?? need.low + 2) : 0;           // ">10 years" drawn as 10–12
  // Two separate clusters of answers → show both: fast track + typical / longer track
  const tracks = e?.tracks ?? null;
  const fast = tracks?.[0] ?? null;
  const slow = tracks?.[1] ?? null;
  const slowHi = slow ? (slow.high ?? slow.low + 2) : 0;
  const hasIt = !!need && yearsIn >= (need.high ?? need.low);
  const inRange = !!need && !hasIt && yearsIn >= need.low;
  const scaleMax = Math.ceil(Math.max(slow ? slowHi + 1 : hi + 1, yearsIn + 1, 3));
  const pct = (y: number) => Math.min(100, Math.max(0, (y / scaleMax) * 100));
  const youPct = pct(yearsIn);
  const winStart = pct(lo);
  const winEnd = pct(hi);
  const youColor = (fast ? yearsIn >= fast.low : hasIt || inRange) ? Colors.positive : Colors.primaryOnDark;
  // Keep labels inside the card: centre them, but pin to an edge near the ends
  const labelPos = (p: number): any =>
    p < 18 ? { left: 0 } : p > 82 ? { right: 0 } : { left: `${p}%`, marginLeft: -80, width: 160, alignItems: 'center' };
  const youText = profile.tenureMonths != null ? formatMonths(profile.tenureMonths) : yearsIn > 0 ? t('{n} yrs', { n: yearsIn }) : t('New');
  const yearsLeft = Math.max(0, lo - yearsIn);
  const roleName = nextTitle || t('the next role');
  const fmtLeft = (y: number) => (y < 1 ? t('a year or less') : Math.ceil(y) === 1 ? t('1 more year') : t('{n} more years', { n: Math.ceil(y) }));
  const L = experienceLabel;
  const summary = !e
    ? null
    : fast && slow
    ? (yearsIn >= slow.low
      ? t("You have the experience most people report for {role} ({fast} on the fast track, {slow} for others). Now's a good time to go for it.", { role: roleName, fast: L(fast.label), slow: L(slow.label) })
      : yearsIn >= fast.low
      ? t("You're in the fast-track range: {fastPct}% say {fast} of related experience is enough for {role}, while {slowPct}% say {slow}. Worth asking now.", { fastPct: fast.sharePct, fast: L(fast.label), role: roleName, slowPct: slow.sharePct, slow: L(slow.label) })
      : t('Answers split for {role}: {fastPct}% say {fast} of related experience (fast track), {slowPct}% say {slow}. The fast track is about {left} away for you.', { role: roleName, fastPct: fast.sharePct, fast: L(fast.label), slowPct: slow.sharePct, slow: L(slow.label), left: fmtLeft(fast.low - yearsIn) }))
    : e.none
    ? t('{role} usually needs no related work experience — you could apply now.', { role: roleName })
    : hasIt
    ? t("You already have the experience {role} usually asks for ({need}). Now's a good time to apply or ask for it.", { role: roleName, need: L(e.label) })
    : inRange
    ? t("You're within the experience {role} usually asks for ({need}). Now's a good time to go for it.", { role: roleName, need: L(e.label) })
    : t('{role} usually needs {need} of related experience — about {left} for you. Use the time to build the skills on the next screen.', { role: roleName, need: L(e.label), left: fmtLeft(yearsLeft) });

  return (
    <Screen
      footer={
        <Button
          label={t('What skills do I need? →')}
          onPress={() => navigation.navigate('SkillsCerts')}
          disabled={loading}
        />
      }
    >
      <TopBar onBack={() => navigation.goBack()} step={1} total={3} />

      <Eyebrow>{t('Seniority · Insight 1 of 3')}</Eyebrow>
      <Headline accent={t('next move')}>{t('Your')}</Headline>
      <Lead>{t('Based on your occupation, here\'s your most achievable next step.')}</Lead>

      {loading && (
        <Card style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="small" />
          <Text style={styles.loadingText}>{t('Finding your best next role…')}</Text>
        </Card>
      )}

      {error && !loading && <Notice tone="danger">{error}</Notice>}

      {(suggestion || pickedOcc) && !loading && (
        <>
          {/* Target role */}
          <Card variant="feature" ticks>
            <Text style={styles.cardLabel}>{t('NEXT ROLE')}</Text>
            <Text style={styles.targetTitle}>{nextTitle}</Text>
            <View style={styles.pickRow}>
              <Text style={styles.tenureNote}>
                {t(pickedOcc ? 'Your choice' : 'Suggested from your current job')}
              </Text>
              <TouchableOpacity onPress={() => { setPickText(''); setPickSoc(null); setPicking((v) => !v); }} hitSlop={10}>
                <Text style={styles.change}>{t(picking ? 'Cancel' : 'Change')}</Text>
              </TouchableOpacity>
            </View>
            {picking && (
              <View style={{ marginBottom: 14 }}>
                <OccupationPicker
                  query={nextTitle}
                  selected={pickSoc}
                  onSelect={setPickSoc}
                  text={pickText}
                  onTextChange={setPickText}
                  allowNone={false}
                />
                <Button label={t('Use this role')} size="sm" onPress={choosePicked} disabled={!pickSoc} style={{ marginTop: 10 }} />
              </View>
            )}
            <View style={styles.statRow}>
              <Stat value={nextMedian > 0 ? formatWage(nextMedian) : '—'} label={t('Median / year · {area}', { area: local.areaName })} size="md" />
              {gain !== null && gain > 0 && (
                <>
                  <View style={styles.divider} />
                  <Stat
                    value={`+${formatWage(gain)}`}
                    label={t('vs. your pay now')}
                    size="md"
                    color={Colors.positive}
                  />
                </>
              )}
            </View>
          </Card>

          {/* Experience needed vs. time in role */}
          <Card>
            <SectionLabel icon="f:clock">{t('Experience needed to be hired')}</SectionLabel>

            {exp.loading ? (
              <ActivityIndicator color={Colors.accent} style={{ marginVertical: 12 }} />
            ) : (
              <>
                {/* "You" label above the bar */}
                <View style={styles.labelRow}>
                  <View style={[styles.labelAbs, labelPos(youPct)]}>
                    <Text style={[styles.lbl, { color: youColor }]}>{t('You · {time} in the role', { time: youText })}</Text>
                  </View>
                </View>

                <View style={styles.bar}>
                  <View style={styles.track} />
                  {fast && slow ? (
                    <>
                      <View style={[styles.promoZone, styles.fastZone, { left: `${pct(fast.low)}%` as any, width: `${Math.max(2, pct(fast.high ?? fast.low + 2) - pct(fast.low))}%` as any }]} />
                      <View style={[styles.promoZone, { left: `${pct(slow.low)}%` as any, width: `${Math.max(2, pct(slowHi) - pct(slow.low))}%` as any }]} />
                    </>
                  ) : need && (
                    <View style={[styles.promoZone, { left: `${winStart}%` as any, width: `${Math.max(2, winEnd - winStart)}%` as any }]} />
                  )}
                  <View style={[styles.fill, { width: `${youPct}%` as any, backgroundColor: youColor }]} />
                  <View style={[styles.dotYou, { left: `${youPct}%` as any, borderColor: youColor }]} />
                </View>

                {fast && slow ? (
                  <View style={styles.labelRow}>
                    <View style={[styles.labelAbs, labelPos((pct(fast.low) + pct(fast.high ?? fast.low + 2)) / 2)]}>
                      <Text style={[styles.lbl, { color: Colors.accentHi }]}>{t(fast.name)}</Text>
                      <Text style={[styles.lblSub, { color: Colors.accentHi }]}>{`${L(fast.label)} · ${fast.sharePct}%`}</Text>
                    </View>
                    <View style={[styles.labelAbs, labelPos((pct(slow.low) + pct(slowHi)) / 2)]}>
                      <Text style={[styles.lbl, { color: Colors.positive }]}>{t(slow.name)}</Text>
                      <Text style={[styles.lblSub, { color: Colors.positive }]}>{`${L(slow.label)} · ${slow.sharePct}%`}</Text>
                    </View>
                  </View>
                ) : need && (
                  <View style={styles.labelRow}>
                    <View style={[styles.labelAbs, labelPos((winStart + winEnd) / 2)]}>
                      <Text style={[styles.lbl, { color: Colors.positive }]}>{t('Usually needed')}</Text>
                      <Text style={[styles.lblSub, { color: Colors.positive }]}>{L(need.label)}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.scale}>
                  <Text style={styles.lblMuted}>{t('Started')}</Text>
                  <Text style={styles.lblMuted}>{t('{n} years', { n: scaleMax })}</Text>
                </View>

                {summary ? (
                  <Notice tone={(fast ? yearsIn >= fast.low : hasIt || inRange || e?.none) ? 'success' : 'info'} icon="f:clock" style={{ marginTop: 14, marginBottom: 0 }}>
                    {summary}
                  </Notice>
                ) : (
                  <Notice tone="info" style={{ marginTop: 14, marginBottom: 0 }}>
                    {nextOcc
                      ? t("There's no official data on the experience this role needs.")
                      : t("We couldn't match this role to an official occupation, so there's no experience data. Tap Change to pick the closest one.")}
                  </Notice>
                )}
                {e && (
                  <Text style={styles.source}>
                    {t('Source: {source} — related work experience needed to be hired, as reported for {occupation}', { source: tSource(e.sourceLabel), occupation: nextOcc?.title ? t(nextOcc.title) : t('this occupation') })}{fast && slow ? ` ${t('(% = share of answers)')}` : ''}
                    {e.lowPrecision ? ` ${t('(small sample — treat as a rough guide)')}` : ''}. {t('Time in role is what you entered.')}
                  </Text>
                )}
              </>
            )}
          </Card>
        </>
      )}

      <Card>
        <KVRow label={t('Current role')} value={t(currentRole)} last={!(currentEarnings > 0)} />
        {currentEarnings > 0 && (
          <KVRow label={t('Current earnings')} value={formatWage(currentEarnings) + '/yr'} last />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.muted },

  cardLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.6, color: Colors.accentHi, marginTop: 4 },
  targetTitle: {
    fontSize: 26,
    lineHeight: 28,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
    marginTop: 6,
    marginBottom: 6,
  },
  tenureNote: { flex: 1, fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 19 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  divider: { width: 1, height: 44, backgroundColor: Colors.line },

  bar: { height: 24, justifyContent: 'center', marginVertical: 2 },
  track: { position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 3, backgroundColor: 'rgba(147,174,221,0.18)' },
  fill: { position: 'absolute', left: 0, height: 6, borderRadius: 3 },
  promoZone: { position: 'absolute', height: 14, borderRadius: 4, backgroundColor: 'rgba(34,197,94,0.28)', borderWidth: 1, borderColor: Colors.positive },
  fastZone: { backgroundColor: 'rgba(255,138,61,0.22)', borderColor: Colors.accentHi },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  change: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.accentHi },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 10, lineHeight: 15 },
  labelRow: { height: 34, position: 'relative', justifyContent: 'center' },
  labelAbs: { position: 'absolute' },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: -6,
    borderWidth: 2,
    borderColor: Colors.denimDark,
  },
  dotYou: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    borderWidth: 3,
    backgroundColor: Colors.denimDark,
  },
  labels: { flexDirection: 'row', marginTop: 10 },
  lbl: { fontSize: 12, fontFamily: Fonts.bold },
  lblMuted: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  lblSub: { fontSize: 11, fontFamily: Fonts.regular, opacity: 0.85 },
});
