import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Svg, {
  Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Line, Text as SvgText,
} from 'react-native-svg';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import KVRow from '../components/KVRow';
import Stat from '../components/Stat';
import Icon from '../components/Icon';
import IconTile from '../components/IconTile';
import SectionLabel from '../components/SectionLabel';
import { Headline, Eyebrow } from '../components/Typography';
import LocationPicker, { LocationResult } from '../components/LocationPicker';
import ShareFrame from '../components/ShareFrame';
import ShareButton from '../components/ShareSheet';
import { getWageMultiplier, getWithinStateMultiplier } from '../data/locationData';
import { useWageBenchmark } from '../lib/benchmarks';
import { calcPercentile } from '../data/blsOews';
import { getAspirationResult } from '../data/aspirationEngine';
import { Colors, Fonts, Radii } from '../theme';
import { shortJobName } from '../lib/format';

type Nav = StackNavigationProp<RootStackParamList>;

type SimpleScreen = 'TimeToNextLevel' | 'RightsHub' | 'EnvironmentFactors' | 'InsightsSummary';
function nextScreen(goal: string | null): SimpleScreen {
  switch (goal) {
    case 'rise_up': return 'TimeToNextLevel';
    case 'claim_rights': return 'RightsHub';
    case 'less_physical': return 'EnvironmentFactors';
    default: return 'InsightsSummary';
  }
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

const money = (n: number) => `$${n.toLocaleString()}`;

// ── Chart geometry ─────────────────────────────────────────────────────────
// The curve is a normal distribution centred on x=150 (the median).
const CURVE_SIGMA = 44;  // px per standard deviation
const curveY = (x: number) => 96 - 84 * Math.exp(-0.5 * Math.pow((x - 150) / CURVE_SIGMA, 2));
const CURVE_PATH = (() => {
  let d = '';
  for (let x = 0; x <= 300; x += 5) d += `${x === 0 ? 'M' : 'L'}${x} ${curveY(x).toFixed(1)} `;
  return d.trim();
})();

/** Inverse standard-normal CDF (Acklam's approximation) */
function invNorm(p: number): number {
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** x position on the curve for a percentile (1–99): area to the left = percentile */
const percentileToX = (pct: number) =>
  Math.min(292, Math.max(8, 150 + invNorm(Math.min(0.99, Math.max(0.01, pct / 100))) * CURVE_SIGMA));

/** "Forklift Operator" → { one: "forklift operator", many: "forklift operators" };
 *  "Hospitality" → { one: "hospitality worker", many: "hospitality workers" } */
function roleNouns(title: string) {
  const t = shortJobName(title);
  const isPerson = /(er|or|ist|ant|ent|ian|man|ive|ic|ee|ier|eur|ard|aid|aide|hand|tech|cook|chef|guard|clerk|nurse)s?$/.test(t);
  if (isPerson) {
    const one = t.replace(/s$/, '');
    return { one, many: t.endsWith('s') ? t : `${t}s` };
  }
  return { one: `${t} worker`, many: `${t} workers` };
}

export default function EarningsRankScreen() {
  const navigation = useNavigation<Nav>();
  const {
    focusGoal: goal, profile, earningsPercentile, matchedOccupation,
    locationState, locationIsMetro, locationMetro, locationLabel,
    setLocation, setEarningsPercentile,
  } = useUserStore();

  const [showPicker, setShowPicker] = useState(false);
  const shareRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);

  const earnings = profile.annualEarnings ?? 0;
  // Pay is required — send anyone without it back to add it
  useEffect(() => {
    if (!profile.annualEarnings) navigation.navigate('ManualEntry', { edit: 'pay' });
  }, [profile.annualEarnings]);
  // Live BLS wages for this occupation — state-specific when a state is set
  // and BLS publishes that cell, otherwise national (or built-in fallback).
  const { benchmark: wages } = useWageBenchmark(matchedOccupation?.soc, locationState);

  // Local wage distribution. State data only needs the metro/rural adjustment;
  // national data still needs the full state index on top.
  const localWages = useMemo(() => {
    const m = !locationState
      ? 1
      : wages.level === 'state'
      ? getWithinStateMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
      : getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined);
    return {
      p10: wages.p10 * m, p25: wages.p25 * m, p50: wages.p50 * m, p75: wages.p75 * m, p90: wages.p90 * m,
    };
  }, [wages, locationState, locationIsMetro, locationMetro]);

  // Percentile and median below always come from the same distribution
  const percentile = useMemo(() => calcPercentile(earnings, localWages), [earnings, localWages]);
  const sourceLine =
    wages.sourceLabel +
    (locationState && wages.level !== 'state' ? ' · adjusted for your area' : '') +
    (locationState && wages.level === 'state' && locationIsMetro !== null ? ' · area-adjusted' : '');

  // Keep the store in sync so the summary / share screens show the same number
  useEffect(() => {
    if (percentile !== earningsPercentile) setEarningsPercentile(percentile);
  }, [percentile]);

  // When the role didn't match a BLS occupation we compare against all US jobs —
  // say so instead of implying it's an occupation-specific figure.
  const nouns = matchedOccupation ? roleNouns(matchedOccupation.title) : null;
  const peerGroup = nouns ? nouns.many : 'US workers (all jobs)';
  const medianWho = nouns ? `The median ${nouns.one}` : 'The median US worker';
  const topWho = nouns ? `The top 25% of ${nouns.many}` : 'The top 25% of US workers';

  // Aspiration result — recomputed when any location/earnings input changes
  const aspiration = useMemo(
    () =>
      getAspirationResult({
        annualEarnings: earnings,
        matchedOccupation,
        locationState,
        locationIsMetro,
        locationMetro,
        localWages,
      }),
    [earnings, matchedOccupation, locationState, locationIsMetro, locationMetro, localWages],
  );

  const dotCx = percentileToX(percentile);
  const dotCy = curveY(dotCx);
  const locationContext = locationLabel ?? 'the US';

  // The finding in words — printed in the shared picture and the share message.
  // Never includes the user's own pay (the sheet promises that).
  // Location as it reads mid-sentence: "rural / suburban New Hampshire", "a city in Ohio"
  const placeInText = locationContext
    .replace(/^Rural \/ suburban /, 'rural / suburban ')
    .replace(/^City in /, 'a city in ');
  const shareCaption =
    aspiration.scenario === 'TOP_EARNER'
      ? `I'm in the top 25% of ${peerGroup} in ${placeInText}. ${medianWho} there earns ${money(aspiration.localMedian)}/yr.`
      : aspiration.scenario === 'ABOVE_MEDIAN'
      ? `${medianWho} in ${placeInText} earns ${money(aspiration.localMedian)}/yr, and the top 25% earn over ${money(aspiration.localP75)}/yr. I'm in the ${percentile}${ordinal(percentile)} percentile.`
      : `${medianWho} in ${placeInText} earns ${money(aspiration.localMedian)}/yr. I'm in the ${percentile}${ordinal(percentile)} percentile — and now I have a plan to close the gap.`;


  return (
    <Screen footer={<Button label="See your moves →" onPress={() => navigation.navigate(nextScreen(goal))} />}>
      <TopBar label="Where I stand" />

      <Eyebrow>Your earnings rank</Eyebrow>
      <Headline accent="stack up">Here's how you</Headline>

      {/* Hero stat + curve — this is the picture people share */}
      <ShareFrame ref={shareRef} capturing={capturing} caption={shareCaption} source={sourceLine}>
      <Card variant="feature" ticks style={styles.heroCard}>
        <View style={styles.heroTop}>
          <Stat value={`${percentile}`} suffix={ordinal(percentile)} size="xl" color={Colors.accent} />
          <Text style={styles.heroCaption}>
            PERCENTILE{'\n'}among {peerGroup} in {locationContext}
          </Text>
        </View>

        <Svg width="100%" height="110" viewBox="0 0 300 110">
          <Defs>
            <SvgGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={Colors.primaryOnDark} stopOpacity="0.35" />
              <Stop offset="100%" stopColor={Colors.primaryOnDark} stopOpacity="0" />
            </SvgGradient>
          </Defs>
          {/* baseline + quartile ticks */}
          <Line x1="0" y1="98" x2="300" y2="98" stroke={Colors.lineStrong} strokeWidth="1" />
          {[percentileToX(25), 150, percentileToX(75)].map((x) => (
            <Line key={x} x1={x} y1="98" x2={x} y2="14" stroke={Colors.line} strokeWidth="1" strokeDasharray="3 4" />
          ))}
          <Path
            d={`${CURVE_PATH} L300 98 L0 98Z`}
            fill="url(#grad)"
          />
          <Path
            d={CURVE_PATH}
            stroke={Colors.primaryOnDark}
            strokeWidth="2"
            fill="none"
          />
          <Line x1={dotCx} y1={dotCy} x2={dotCx} y2="98" stroke={Colors.accent} strokeWidth="1.5" />
          <Circle cx={dotCx} cy={dotCy} r="7" fill={Colors.accent} stroke="#fff" strokeWidth="2" />
          <SvgText
            x={dotCx > 240 ? dotCx - 12 : dotCx + 12}
            y={dotCy - 6}
            fontSize="12"
            fontWeight="700"
            fill={Colors.accentHi}
            textAnchor={dotCx > 240 ? 'end' : 'start'}
          >
            YOU
          </SvgText>
          <SvgText x="150" y="108" fontSize="8" fill={Colors.slate} textAnchor="middle">MEDIAN</SvgText>
        </Svg>
      </Card>
      </ShareFrame>
      <View style={{ marginBottom: 14, marginTop: -4 }}>
        <ShareButton
          captureRef={shareRef}
          onCapturing={setCapturing}
          screen="earnings_rank"
          message={`${shareCaption} Where do you stand? Check yours free:`}
        />
      </View>

      {/* Numbers */}
      <Card>
        <KVRow label="Your earnings" value={`${money(earnings)}/yr`} valueColor={Colors.accentHi} />
        <KVRow
          last
          label={locationState ? `Median · ${locationLabel ?? locationState}` : 'US national median'}
          value={`${money(aspiration.localMedian)}/yr`}
        />
        <Text style={styles.source}>Source: {sourceLine}</Text>
      </Card>

      {/* Location nudge */}
      <TouchableOpacity
        style={[styles.nudge, locationLabel ? styles.nudgeSet : null]}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
      >
        <Icon name="f:map-pin" size={18} color={locationLabel ? Colors.positive : Colors.accentHi} />
        <Text style={styles.nudgeText}>
          {locationLabel ? (
            <>
              <Text style={{ color: Colors.text, fontFamily: Fonts.bold }}>{locationLabel}</Text>
              {'  ·  tap to change'}
            </>
          ) : (
            'Add your location to get local benchmarks'
          )}
        </Text>
        <Icon name="f:chevron-right" size={18} color={Colors.slate} />
      </TouchableOpacity>

      {/* ── Aspiration card ──────────────────────────────────────────────── */}
      {aspiration.scenario === 'BELOW_MEDIAN' && (
        <Card variant="accent">
          <View style={styles.aspHead}>
            <IconTile icon="chart-bell-curve" tone="accent" size={40} />
            <Text style={styles.aspTitle}>Most comparable workers earn more</Text>
          </View>
          <Text style={styles.aspBody}>
            {medianWho} in {locationContext} earns{' '}
            <Text style={styles.hl}>{money(aspiration.localMedian)}/yr</Text> — that's{' '}
            <Text style={styles.hl}>{money(Math.abs(aspiration.gapToMedian))} more</Text> than you
            earn now. Closing that gap is a realistic first target.
          </Text>
          <View style={styles.target}>
            <Text style={styles.targetLabel}>YOUR TARGET</Text>
            <Text style={styles.targetValue}>{money(aspiration.localMedian)}/yr</Text>
          </View>
        </Card>
      )}

      {aspiration.scenario === 'ABOVE_MEDIAN' && (
        <Card variant="accent">
          <View style={styles.aspHead}>
            <IconTile icon="trending-up" tone="accent" size={40} />
            <Text style={styles.aspTitle}>You're above average — there's still room</Text>
          </View>
          <Text style={styles.aspBody}>
            {topWho} in {locationContext} earn over{' '}
            <Text style={styles.hl}>{money(aspiration.localP75)}/yr</Text>. That's{' '}
            <Text style={styles.hl}>{money(aspiration.gapToP75)} more</Text> than you earn now — and
            a realistic next milestone.
          </Text>
          <View style={styles.target}>
            <Text style={styles.targetLabel}>NEXT MILESTONE</Text>
            <Text style={styles.targetValue}>{money(aspiration.localP75)}/yr</Text>
          </View>
        </Card>
      )}

      {aspiration.scenario === 'TOP_EARNER' && (
        <Card variant="positive">
          <View style={styles.aspHead}>
            <IconTile icon="trophy-outline" tone="positive" size={40} />
            <Text style={styles.aspTitle}>You're a top earner here</Text>
          </View>
          <Text style={styles.aspBody}>
            You're in the top 25% of {peerGroup} in {locationContext}. Here's
            what's next:
          </Text>

          {aspiration.higherMarkets.length > 0 && (
            <>
              <SectionLabel icon="f:map-pin">Higher-paying markets</SectionLabel>
              {aspiration.higherMarkets.map((m) => (
                <View key={m.label} style={styles.sugRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugTitle}>{m.label}</Text>
                    <Text style={styles.sugSub}>Top 25% earn {money(m.localP75)}/yr</Text>
                  </View>
                  <Text style={styles.sugGain}>+{money(m.gain)}</Text>
                </View>
              ))}
            </>
          )}

          {aspiration.careerSteps.length > 0 && (
            <>
              <SectionLabel icon="f:trending-up">Next career moves</SectionLabel>
              {aspiration.careerSteps.map((step) => (
                <View key={step.title} style={styles.sugRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sugTitle}>{step.title}</Text>
                    <Text style={styles.sugSub}>Median {money(step.medianWage)}/yr</Text>
                  </View>
                  <Text style={styles.sugGain}>+{money(step.gain)}</Text>
                </View>
              ))}
            </>
          )}
        </Card>
      )}

      <LocationPicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(result: LocationResult) => {
          setLocation(result);
          setShowPicker(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: { paddingTop: 20 },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 6 },
  heroCaption: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: Fonts.semiBold,
    color: Colors.textSoft,
    paddingBottom: 10,
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.accentLine,
    borderRadius: Radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  nudgeSet: { borderStyle: 'solid', borderColor: 'rgba(34,197,94,0.45)' },
  nudgeText: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textSoft },

  aspHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  aspTitle: { flex: 1, fontSize: 17, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 22 },
  aspBody: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 21 },
  hl: { fontFamily: Fonts.bold, color: Colors.accentHi },
  target: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  targetLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.4, color: Colors.slate },
  targetValue: { fontSize: 26, fontFamily: Fonts.displayBlack, color: Colors.accent },

  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
    gap: 8,
  },
  sugTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  sugSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2 },
  sugGain: { fontSize: 20, fontFamily: Fonts.displayBlack, color: Colors.positive },
});
