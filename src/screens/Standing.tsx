/**
 * Where I stand — ONE short screen:
 *   1. Where you are: the rank chart (shareable) + one plain statement
 *   2. Your plan: one summary card of the task list (in the plan or still to
 *      review), grouped like My plan by effort — Quick wins, Worth the effort,
 *      Big moves — with at least one row from each group (max 6 rows).
 * The details of each opportunity live in its own page / My plan.
 * Pay-claim items only appear when the pay check finds a problem.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Svg, {
  Path, Defs, LinearGradient as SvgGradient, Stop, Circle, Line, Text as SvgText,
} from 'react-native-svg';
import { RootStackParamList } from '../navigation/AppNavigator';
import { track, suggestionProps } from '../lib/analytics';
import { useUserStore } from '../store/userStore';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import Card from '../components/Card';
import Stat from '../components/Stat';
import Icon from '../components/Icon';
import SectionLabel from '../components/SectionLabel';
import { Headline, Eyebrow } from '../components/Typography';
import LocationPicker, { LocationResult } from '../components/LocationPicker';
import ShareFrame from '../components/ShareFrame';
import ShareButton from '../components/ShareSheet';
import RightsCheckCard from '../components/RightsCheckCard';
import { getWageMultiplier, getWithinStateMultiplier } from '../data/locationData';
import { useWageBenchmark } from '../lib/benchmarks';
import { calcPercentile } from '../data/blsOews';
import { getAspirationResult } from '../data/aspirationEngine';
import { useMinimumWageCheck } from '../lib/useMinimumWageCheck';
import { useOpportunities } from '../lib/useOpportunities';
import { usePlanView, EFFORT_INFO } from '../lib/planView';
import { useRiseOpportunities } from '../data/riseOpportunities';
import { useExperience } from '../lib/experience';
import { fetchTrainingOptions } from '../lib/certPay';
import { tenureYears, placeName, placeInSentence, translatedJob, shortJobNameEnglish } from '../lib/format';
import { goTab } from '../lib/nav';
import { GOALS } from './GoalPicker';
import { titleForGoal, type Opportunity } from '../data/opportunityCatalog';
import { Colors, Fonts, Radii } from '../theme';
import { shortJobName } from '../lib/format';
import { t, isSpanish, tSource } from '../i18n';
import CosFlagTag, { cosRowStyle } from '../components/CosFlagTag';
import { cosFlagsOf } from '../lib/cosFlags';

type Nav = StackNavigationProp<RootStackParamList>;

/** Pay-claim items are only suggested when the pay check finds a problem */
const CLAIM_IDS = ['minimum-wage-check', 'wage-theft-claim'];

function ordinal(n: number) {
  if (isSpanish()) return '';   // "percentil 62"
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
  if (isSpanish()) {
    // Spanish sentences only use the plural
    const short = shortJobNameEnglish(title);
    const es = translatedJob(short);
    const many = es ?? t('workers in "{job}"', { job: t(title) });
    return { one: many, many };
  }
  const name = shortJobName(title);
  const isPerson = /(er|or|ist|ant|ent|ian|man|ive|ic|ee|ier|eur|ard|aid|aide|hand|tech|cook|chef|guard|clerk|nurse)s?$/.test(name);
  if (isPerson) {
    const one = name.replace(/s$/, '');
    return { one, many: name.endsWith('s') ? name : `${name}s` };
  }
  return { one: `${name} worker`, many: `${name} workers` };
}

const yearsText = (y: number) => (y < 1 ? 'less than a year' : `${Math.round(y)} year${Math.round(y) === 1 ? '' : 's'}`);

/** Typical program length near the user (DOL) for an opportunity with official training */
function useTrainingWeeks(soc: string | null) {
  const { locationState, homePoint } = useUserStore();
  const [weeks, setWeeks] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setWeeks(null);
    if (!soc) return;
    fetchTrainingOptions(soc, locationState, homePoint).then((d) => {
      if (alive) setWeeks(d?.summary.median_weeks ?? null);
    });
    return () => { alive = false; };
  }, [soc, locationState, homePoint?.zip]);
  return weeks;
}

function weeksText(w: number) {
  return w < 9 ? `About ${Math.round(w)} week${Math.round(w) === 1 ? '' : 's'} of training` : `About ${Math.round(w / 4.33)} months of training`;
}

export default function StandingScreen() {
  const navigation = useNavigation<Nav>();
  const store = useUserStore();
  const {
    focusGoal: goal, profile, earningsPercentile, matchedOccupation, planDecisions, setPlanDecision,
    locationState, locationStateName, locationIsMetro, locationMetro, locationLabel,
    setLocation, setEarningsPercentile,
  } = store;

  const [showPicker, setShowPicker] = useState(false);
  const shareRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [pathY, setPathY] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const earnings = profile.annualEarnings ?? 0;
  useEffect(() => {
    if (!profile.annualEarnings) navigation.navigate('ManualEntry', { edit: 'pay' });
  }, [profile.annualEarnings]);

  // ── 1. Where you are ─────────────────────────────────────────────────────
  const { benchmark: wages } = useWageBenchmark(matchedOccupation?.soc, locationState);
  const localWages = useMemo(() => {
    const m = !locationState
      ? 1
      : wages.level === 'state'
      ? getWithinStateMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined)
      : getWageMultiplier(locationState, locationIsMetro ?? false, locationMetro ?? undefined);
    return { p10: wages.p10 * m, p25: wages.p25 * m, p50: wages.p50 * m, p75: wages.p75 * m, p90: wages.p90 * m };
  }, [wages, locationState, locationIsMetro, locationMetro]);
  const percentile = useMemo(() => calcPercentile(earnings, localWages), [earnings, localWages]);
  const sourceLine =
    tSource(wages.sourceLabel) +
    (locationState && wages.level !== 'state' ? ` · ${t('adjusted for your area')}` : '') +
    (locationState && wages.level === 'state' && locationIsMetro !== null ? ` · ${t('area-adjusted')}` : '');
  useEffect(() => {
    if (percentile !== earningsPercentile) setEarningsPercentile(percentile);
  }, [percentile]);

  const nouns = matchedOccupation ? roleNouns(matchedOccupation.title) : null;
  const peerGroup = nouns ? nouns.many : t('US workers (all jobs)');
  const medianWho = nouns ? t('The median {job}', { job: nouns.one }) : t('The median US worker');
  const aspiration = useMemo(
    () => getAspirationResult({ annualEarnings: earnings, matchedOccupation, locationState, locationIsMetro, locationMetro, localWages }),
    [earnings, matchedOccupation, locationState, locationIsMetro, locationMetro, localWages],
  );
  const dotCx = percentileToX(percentile);
  const dotCy = curveY(dotCx);
  const locationContext = placeName(locationLabel);
  const placeInText = placeInSentence(locationLabel);

  const mw = useMinimumWageCheck();
  const shortfall = locationState ? mw.annualShortfall : 0;

  // One statement about where the user stands
  const statement =
    shortfall > 0
      ? (locationStateName
        ? t("Your pay looks below {state}'s minimum wage — about {amount} a year short.", { state: locationStateName, amount: money(shortfall) })
        : t('Your pay looks below your state\'s minimum wage — about {amount} a year short.', { amount: money(shortfall) }))
      : aspiration.scenario === 'BELOW_MEDIAN'
      ? t("Half of {group} in {place} earn at least {median} — that's {gap} more than you.", { group: peerGroup, place: placeInText, median: money(aspiration.localMedian), gap: money(Math.abs(aspiration.gapToMedian)) })
      : aspiration.scenario === 'ABOVE_MEDIAN'
      ? t('You earn more than {pct}% of {group} in {place}. The top quarter earn {p75} or more.', { pct: percentile, group: peerGroup, place: placeInText, p75: money(aspiration.localP75) })
      : t("You earn more than {pct}% of {group} in {place} — you're in the top quarter.", { pct: percentile, group: peerGroup, place: placeInText });

  const shareCaption =
    aspiration.scenario === 'TOP_EARNER'
      ? t('I earn more than {pct} out of 100 {group} in {place}. Typical pay there is {median}/yr.', { pct: percentile, group: peerGroup, place: placeInText, median: money(aspiration.localMedian) })
      : aspiration.scenario === 'ABOVE_MEDIAN'
      ? t('I earn more than {pct} out of 100 {group} in {place}. Typical pay there is {median}/yr, and the top 25% earn over {p75}/yr.', { pct: percentile, group: peerGroup, place: placeInText, median: money(aspiration.localMedian), p75: money(aspiration.localP75) })
      : t('Typical pay for {group} in {place} is {median}/yr. I earn more than {pct} out of 100 — and now I have a plan to close the gap.', { group: peerGroup, place: placeInText, median: money(aspiration.localMedian), pct: percentile });

  // ── 2. Your path to <goal> ───────────────────────────────────────────────
  const goalInfo = GOALS.find((g) => g.id === goal);
  const { byGoal, display, plan, boostOf } = useOpportunities();
  // The headline next step is for the goal the user is focusing on
  const opportunities = byGoal[0]?.opportunities ?? [];
  const rise = useRiseOpportunities();
  const ranked = useMemo(() => {
    const list = opportunities.filter((o) => !CLAIM_IDS.includes(o.id) || shortfall > 0);
    const byGain = [...list].sort((a, b) => display(b).gainAmount - display(a).gainAmount);
    // A legal pay problem always comes first
    const claim = shortfall > 0 ? list.find((o) => o.id === 'right:minimum_wage' || o.id === 'minimum-wage-check') : undefined;
    return claim ? [claim, ...byGain.filter((o) => o !== claim)] : byGain;
  }, [opportunities, shortfall, display]);

  const isRise = goal === 'rise_up' && shortfall <= 0;
  // Promotions are data-driven plan items now (data/careerMoves), ranked like the rest
  const primary: Opportunity | undefined = ranked[0];
  const others = ranked.filter((o) => o.id !== primary?.id).slice(0, 5);

  // Move-up details (next role, O*NET experience)
  const exp = useExperience(isRise ? store.targetCareerSoc ?? store.targetCareerPay?.soc ?? null : null);
  const trainingSoc = primary?.trainingSoc === 'current' ? matchedOccupation?.soc ?? null : primary?.trainingSoc ?? null;
  const trainingWeeks = useTrainingWeeks(!isRise ? trainingSoc : null);

  const yearsIn = tenureYears(profile);
  let nextStep = primary ? titleForGoal(primary, goal) : null;
  let boost: { text: string; source?: string } = { text: 'No official estimate' };
  let actions: string[] = primary ? primary.steps.slice(0, 3).map((s) => s.title) : [];
  let timeline: { text: string; source?: string } = { text: 'No official estimate' };

  if (isRise) {
    const title = store.targetCareerTitle;
    nextStep = title ? `Become ${title}` : 'Find your next role';
    const pay = store.targetCareerPay;
    if (pay && earnings > 0) {
      const diff = Math.round((pay.median - earnings) / 100) * 100;
      boost = diff > 0
        ? { text: `+${money(diff)}/yr — typical pay ${money(pay.median)} in ${pay.area}`, source: pay.source }
        : { text: `About what you earn now (${money(pay.median)} in ${pay.area})`, source: pay.source };
    }
    const missing = store.targetCareerCerts.filter((c) => !store.markedSkills.includes(c));
    actions = title
      ? [...(missing.length ? [`Get ${missing.slice(0, 2).join(' and ')}`] : []), 'Tell your manager you\'re aiming for it', 'Apply for openings']
      : ['See the role we suggest — or pick your own'];
    const e = exp.data;
    if (e) {
      const fast = e.tracks?.[0];
      const low = fast ? fast.low : e.low;
      const high = fast ? fast.high ?? fast.low + 2 : e.high ?? e.low + 2;
      timeline = {
        text: e.none || yearsIn >= low
          ? 'You may already have the experience it asks for'
          : `About ${yearsText(Math.max(0, low - yearsIn))}–${yearsText(Math.max(0, high - yearsIn))} more experience${fast ? ' (fast track)' : ''}`,
        source: `${e.sourceLabel} — experience needed to be hired`,
      };
    }
  } else if (primary) {
    const g = display(primary);
    if (g.gainAmount > 0) boost = { text: `+${money(g.gainAmount)}/yr`, source: g.source };
    else if (g.gain) boost = { text: g.gain, source: g.source };
    if (primary.gainModel === 'min_wage_gap') timeline = { text: 'Depends on your claim' };
    else if (trainingWeeks) timeline = { text: weeksText(trainingWeeks), source: 'U.S. Dept. of Labor, approved training programs' };
  }

  const primaryDecision = primary ? planDecisions[primary.id] : undefined;

  // ── Your plan so far: accepted + still to review ─────────────────────────
  const pv = usePlanView();
  const accepted = pv.accepted;
  const pending = pv.pending;
  const potentialBoost = pv.potentialBoost;
  // Up to 6 rows in My plan's effort groups. Every group gets at least its top
  // item, so a big move is visible even when there are many quick wins.
  const MAX_ROWS = 6;
  const take = pv.buckets.map((b) => Math.min(1, b.items.length));
  let room = MAX_ROWS - take.reduce((a, n) => a + n, 0);
  pv.buckets.forEach((b, i) => {
    const more = Math.max(0, Math.min(b.items.length - take[i], room));
    take[i] += more;
    room -= more;
  });
  const groups = pv.buckets.map((b, i) => ({ effort: b.effort, rows: b.items.slice(0, take[i]) })).filter((g) => g.rows.length);
  const multiGoal = pv.userGoals.length > 1;
  const openPrimary = () => {
    if (isRise) navigation.navigate('TimeToNextLevel');
    else if (primary) navigation.navigate('NextSteps', { opportunityId: primary.id, goal: goal ?? undefined });
  };
  const addPrimary = () => {
    if (!primary) return;
    track('suggestion_added', { ...suggestionProps(primary, goal), from: 'standing' });
    setPlanDecision(primary.id, 'in_plan');
    goTab(navigation, 'Plan');
  };

  return (
    <Screen scrollRef={scrollRef}>
      <TopBar label={t('Where I stand')} />

      <Eyebrow>{t('Your earnings rank')}</Eyebrow>
      <Headline accent={t('stack up')}>{t('Here\'s how you')}</Headline>

      {/* No location yet: ask for it up front — every number below depends on it */}
      {!locationLabel && (
        <Card variant="accent" style={styles.locCard}>
          <View style={styles.locHead}>
            <View style={styles.locIcon}><Icon name="f:map-pin" size={20} color={Colors.accentHi} /></View>
            <Text style={styles.locTitle}>{t('Where do you work?')}</Text>
          </View>
          <Text style={styles.locBody}>
            {t('This is the most important thing for accurate results. Pay, minimum wage and courses change a lot from state to state and city to city.')}
          </Text>
          <Text style={styles.locBody}>
            {t('Right now we compare you with workers across the whole US, so the numbers below may be off.')}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Button label={t('Add my location')} icon="f:map-pin" onPress={() => setShowPicker(true)} />
          </View>
        </Card>
      )}

      {/* The rank card — this is the picture people share.
          Plain words instead of a chart: the finding as the heading, then a
          simple "lowest → highest pay" bar with the user on it. */}
      <ShareFrame ref={shareRef} capturing={capturing} caption={shareCaption} source={sourceLine}>
        <Card variant="feature" ticks style={styles.heroCard}>
          {/* The heading includes how far the user is from typical pay, which
              reveals their pay — so it is left out of the shared picture */}
          {!capturing && (
            <Text style={[styles.statement, shortfall > 0 && { color: Colors.warning }]}>{statement}</Text>
          )}
          <RankBar pct={percentile} wages={localWages} earnings={earnings} capturing={capturing} />
          <Text style={styles.rankLine}>
            {t('You earn more than {pct} out of 100 {group} in {place}.', { pct: percentile, group: peerGroup, place: locationContext })}
          </Text>
        </Card>
      </ShareFrame>
      <Text style={styles.source}>{t('Source: {source}', { source: shortfall > 0 ? t('US Dept. of Labor state minimum wage table') : sourceLine })}</Text>

      <View style={styles.actionsRow}>
        <ShareButton
          captureRef={shareRef}
          onCapturing={setCapturing}
          screen="earnings_rank"
          label={t('Share')}
          message={`${shareCaption} ${t('Where do you stand? Check yours free:')}`}
        />
      </View>

      {/* Location: set → show it with a way to change it; not set → a second reminder */}
      <TouchableOpacity style={[styles.nudge, locationLabel ? styles.nudgeSet : styles.nudgeMissing]} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
        <Icon name="f:map-pin" size={16} color={locationLabel ? Colors.positive : Colors.accentHi} />
        <Text style={styles.nudgeText}>
          {locationLabel
            ? <><Text style={{ color: Colors.text, fontFamily: Fonts.bold }}>{locationContext}</Text>{`  ·  ${t('change')}`}</>
            : <Text style={{ color: Colors.text, fontFamily: Fonts.bold }}>{t('Add your location to see your real local numbers')}</Text>}
        </Text>
        <Icon name="f:chevron-right" size={16} color={Colors.slate} />
      </TouchableOpacity>

      {/* ── Claim my rights: what you may be owed, what's still to check ── */}
      <RightsCheckCard />

      {/* ── Your plan so far ── */}
      {(accepted.length > 0 || pending.length > 0) && (
        <View onLayout={(e) => setPathY(e.nativeEvent.layout.y)}>
          <SectionLabel icon="f:check-square">
            {multiGoal ? t('Your plan') : t('Your plan to: {goal}', { goal: t(goalInfo?.label ?? 'Earn more money') })}
          </SectionLabel>
          <Card variant={accepted.length ? 'positive' : 'default'}>
            <View style={styles.planStats}>
              <View style={styles.planStat}>
                <Text style={styles.planNum}>{accepted.length}</Text>
                <Text style={styles.planLbl}>{t('in your plan')}</Text>
              </View>
              <View style={styles.planStat}>
                <Text style={[styles.planNum, { color: Colors.accentHi }]}>{pending.length}</Text>
                <Text style={styles.planLbl}>{t('to review')}</Text>
              </View>
              <View style={[styles.planStat, { flex: 1.4 }]}>
                <Text style={[styles.planNum, { color: Colors.positive }]}>{potentialBoost > 0 ? `+${money(potentialBoost)}` : '—'}</Text>
                <Text style={styles.planLbl}>{t('potential yearly boost')}</Text>
              </View>
            </View>
            {groups.map((grp) => (
              <View key={grp.effort}>
                <Text style={styles.planGoal}>{t(EFFORT_INFO[grp.effort].title)}</Text>
                {grp.rows.map((o) => {
                  const g = display(o);
                  const inPlan = planDecisions[o.id] === 'in_plan';
                  return (
                    <View key={o.id} style={[styles.planRow, cosFlagsOf(o) ? cosRowStyle : null]}>
                      <Icon name={inPlan ? 'f:check-circle' : 'f:eye'} size={16} color={inPlan ? Colors.positive : Colors.accentHi} />
                      <View style={{ flex: 1 }}>
                        <CosFlagTag opp={o} />
                        <Text style={styles.planItem} numberOfLines={1}>{pv.titleOf(o)}</Text>
                      </View>
                      {g.gainAmount > 0 ? <Text style={styles.planGain}>+{money(g.gainAmount)}</Text> : null}
                    </View>
                  );
                })}
              </View>
            ))}
            <View style={styles.legend}>
              <Icon name="f:check-circle" size={12} color={Colors.positive} />
              <Text style={styles.legendText}>{t('in your plan')}</Text>
              <Icon name="f:eye" size={12} color={Colors.accentHi} />
              <Text style={styles.legendText}>{t('still to review')}</Text>
            </View>
            <Text style={styles.planNote}>{t('Pay fixes and add-ons add up; career moves are alternatives, so only the best one counts.')}</Text>
            <View style={{ marginTop: 12 }}>
              <Button label={t('See how to get there →')} size="sm" onPress={() => goTab(navigation, 'Plan')} />
            </View>
          </Card>
        </View>
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

/** Lowest → highest pay bar with the user's place on it; "Typical pay" in the middle */
/**
 * Lowest → highest pay bar with the user's place on it. The bar is a percentile
 * scale; three points carry their pay (BLS, where the user works): the 10th
 * percentile ("10% earn less"), the median ("typical") and the 90th percentile
 * ("10% earn more"). The user's own pay shows next to YOU — but never in the
 * shared picture (capturing), like the statement above it.
 */
function RankBar({ pct, wages, earnings, capturing }: {
  pct: number; wages: { p10: number; p50: number; p90: number }; earnings: number; capturing: boolean;
}) {
  const at = Math.min(97, Math.max(3, pct));
  const round100 = (n: number) => money(Math.round(n / 100) * 100);
  const showMine = !capturing && earnings > 0;
  // Keep the "YOU" label inside the card near the ends
  const youAlign = at < 15 ? 'flex-start' : at > 85 ? 'flex-end' : 'center';
  const youPos: any = at < 15 ? { left: 0 } : at > 85 ? { right: 0 } : { left: `${at}%`, marginLeft: -70, width: 140 };
  return (
    <View style={styles.rank}>
      <View style={styles.rankLabels}>
        <View style={[styles.youWrap, youPos, { alignItems: youAlign }]}>
          <Text style={styles.youText}>{showMine ? `${t('YOU')} · ${round100(earnings)}` : t('YOU')}</Text>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${at}%` }]} />
        <View style={[styles.tick, { left: '10%' }]} />
        <View style={styles.midTick} />
        <View style={[styles.tick, { left: '90%' }]} />
        <View style={[styles.dot, { left: `${at}%` }]} />
      </View>
      <View style={styles.axis}>
        <View style={[styles.axisLabel, { left: '10%', marginLeft: -36 }]}>
          <Text style={styles.axisMoney}>{round100(wages.p10)}</Text>
          <Text style={styles.axisText}>{t('10% earn less')}</Text>
        </View>
        <View style={[styles.axisLabel, { left: '50%', marginLeft: -36 }]}>
          <Text style={styles.axisMoney}>{round100(wages.p50)}</Text>
          <Text style={styles.axisText}>{t('typical pay')}</Text>
        </View>
        <View style={[styles.axisLabel, { right: '10%', marginRight: -36 }]}>
          <Text style={styles.axisMoney}>{round100(wages.p90)}</Text>
          <Text style={styles.axisText}>{t('10% earn more')}</Text>
        </View>
      </View>
    </View>
  );
}

function PathLine({ icon, label, value, source, highlight }: { icon: string; label: string; value: string; source?: string; highlight?: boolean }) {
  return (
    <View style={styles.pathLine}>
      <Icon name={icon} size={16} color={Colors.slate} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pathLabel}>{label}</Text>
        <Text style={[styles.pathValue, highlight && { color: Colors.positive }]}>{value}</Text>
        {source ? <Text style={styles.pathSource}>{source}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: { paddingTop: 18 },
  rank: { marginTop: 14 },
  rankLabels: { height: 18, marginBottom: 4 },
  youWrap: { position: 'absolute', top: 0 },
  youText: { fontSize: 12, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.accentHi },
  track: { height: 14, borderRadius: 7, backgroundColor: 'rgba(147,174,221,0.18)', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7, backgroundColor: Colors.accent },
  midTick: { position: 'absolute', left: '50%', width: 2, marginLeft: -1, top: -4, bottom: -4, backgroundColor: Colors.slate, opacity: 0.7 },
  dot: { position: 'absolute', width: 24, height: 24, marginLeft: -12, borderRadius: 12, backgroundColor: Colors.accent, borderWidth: 3, borderColor: '#fff' },
  tick: { position: 'absolute', width: 2, marginLeft: -1, top: -2, bottom: -2, backgroundColor: Colors.slate, opacity: 0.5 },
  axis: { height: 34, marginTop: 8 },
  axisLabel: { position: 'absolute', top: 0, width: 72, alignItems: 'center' },
  axisMoney: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.text },
  axisText: { fontSize: 10, fontFamily: Fonts.semiBold, color: Colors.slate, textAlign: 'center' },
  rankLine: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginTop: 14 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 6 },
  heroCaption: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: Fonts.semiBold, color: Colors.textSoft, paddingBottom: 10 },
  statement: { fontSize: 19, lineHeight: 26, fontFamily: Fonts.bold, color: Colors.text },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 4 },
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-start', marginTop: 12, marginBottom: 12 },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.accentLine, borderRadius: Radii.lg,
    paddingVertical: 11, paddingHorizontal: 14, marginBottom: 18,
  },
  nudgeSet: { borderStyle: 'solid', borderColor: 'rgba(34,197,94,0.45)' },
  nudgeMissing: { borderStyle: 'solid', borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  locCard: { marginBottom: 16 },
  locHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  locIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accentSoft },
  locTitle: { flex: 1, fontSize: 18, lineHeight: 23, fontFamily: Fonts.bold, color: Colors.text },
  locBody: { fontSize: 14, lineHeight: 20, fontFamily: Fonts.regular, color: Colors.textSoft, marginTop: 4 },
  nudgeText: { flex: 1, fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft },
  pathTitle: { fontSize: 20, lineHeight: 25, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 6 },
  pathLine: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.line },
  pathLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.slate, textTransform: 'uppercase' },
  pathValue: { fontSize: 15, lineHeight: 21, fontFamily: Fonts.semiBold, color: Colors.text, marginTop: 2 },
  pathSource: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 2 },
  more: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi, marginTop: 6 },
  empty: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft },
  otherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line,
  },
  otherTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  otherSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2 },
  otherGain: { fontSize: 17, fontFamily: Fonts.displayBlack, color: Colors.positive },
  planStats: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  planStat: { flex: 1 },
  planNum: { fontSize: 26, fontFamily: Fonts.displayBlack, color: Colors.text },
  planLbl: { fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.slate },
  planPotential: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginBottom: 6 },
  planGoal: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.slate, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.line },
  planItem: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  planGain: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.positive },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  legendText: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginRight: 8 },
  planNote: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 6 },
});
