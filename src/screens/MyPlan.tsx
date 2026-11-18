/**
 * My plan tab — ONE task list (2026-10-21, Amit):
 *   share card · yearly boost · the list grouped by effort — Quick wins,
 *   Worth the effort, Big moves (in the plan and still to review together,
 *   highest value first) · Done ✓ · All suggestions (incl. "Not for me") ·
 *   job offers · "Add a goal".
 * Each item shows short tags for the user's goals it helps (only when the user
 * has more than one goal). Each item opens its opportunity page.
 */
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore, type Goal } from '../store/userStore';
import { usePlanView, EFFORT_INFO } from '../lib/planView';
import { goTab } from '../lib/nav';
import { captureImage, shareTo } from '../lib/share';
import { shareLink } from '../config/share';
import { useAuthStore } from '../store/authStore';
import ShareFrame from '../components/ShareFrame';
import { GOALS } from './GoalPicker';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Card from '../components/Card';
import Icon from '../components/Icon';
import Button from '../components/Button';
import SectionLabel from '../components/SectionLabel';
import { Headline } from '../components/Typography';
import type { Opportunity } from '../data/opportunityCatalog';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';
import MoveTag from '../components/MoveTag';

type Nav = StackNavigationProp<RootStackParamList>;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function MyPlanScreen() {
  const navigation = useNavigation<Nav>();
  const { wantsJobOffers, planMeta, focusGoal: goal } = useUserStore();
  const userId = useAuthStore((s) => s.user?.id);
  const v = usePlanView();
  const shareRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const [sharing, setSharing] = useState(false);

  // ── The plan in one picture (what gets shared) ──────────────────────────
  // Never the user's own pay — only the goal, the steps and their gains.
  // The promotion / career change in the plan (one of each), for "I'm on my way to becoming a …"
  const moveFor = goal === 'rise_up' ? 'promotion' : goal === 'change_careers' ? 'career_change' : null;
  const targetCareerTitle = moveFor ? v.accepted.find((o) => o.exclusiveGroup === moveFor)?.targetTitle ?? null : null;
  const goalLabel = t(GOALS.find((g) => g.id === goal)?.toDo ?? 'get ahead');
  // The headline speaks to the focus goal; the money goes in the subline
  // unless the goal itself is earning more.
  const GOAL_HEADLINES: Partial<Record<Goal, string>> = {
    rise_up: "I'm working toward a promotion",
    change_careers: "I'm on my way to a new career",
    claim_rights: "I'm standing up for my rights at work",
    less_physical: "I'm on my way to work that's easier on my body",
    work_life_balance: "I'm on my way to a better work-life balance",
  };
  const earnHeadline = goal === 'earn_more' && v.planBoost > 0;
  const headline = targetCareerTitle
    ? (/^[aeiou]/i.test(targetCareerTitle) ? t("I'm on my way to becoming an {role}", { role: targetCareerTitle }) : t("I'm on my way to becoming a {role}", { role: targetCareerTitle }))
    : earnHeadline
    ? t("I'm going to earn +{amount} more a year", { amount: money(v.planBoost) })
    : goal && GOAL_HEADLINES[goal]
    ? t(GOAL_HEADLINES[goal]!)
    : t("I've made a plan to {goal}", { goal: goalLabel });
  const subline = !earnHeadline && v.planBoost > 0
    ? t("That's +{amount} a year. Here's how I'll get there:", { amount: money(v.planBoost) })
    : t("Here's how I'll get there:");
  // Steps for the focus goal first
  const focusIds = new Set(v.accepted.filter((o) => !!goal && o.goalAlignment.includes(goal)).map((o) => o.id));
  const heroItems = [...v.accepted.filter((o) => focusIds.has(o.id)), ...v.accepted.filter((o) => !focusIds.has(o.id))];
  const sources = Array.from(new Set(v.accepted.map((o) => v.display(o).source).filter(Boolean))) as string[];

  async function sharePlan() {
    setSharing(true);
    try {
      setCapturing(true);
      await new Promise((r) => setTimeout(r, 150));          // let the branded footer render
      const image = await captureImage(shareRef).catch(() => null);
      setCapturing(false);
      const refCode = userId ? userId.replace(/-/g, '').slice(0, 8) : null;
      await shareTo('other', {
        image,
        message: `${headline}. ${t('Make your own plan for free:')} ${shareLink(refCode)}`,
        screen: 'my_plan',
        refCode,
      });
    } finally {
      setCapturing(false);
      setSharing(false);
    }
  }
  const open = (o: Opportunity, goal?: Goal | null) =>
    navigation.navigate('NextSteps', { opportunityId: o.id, goal: goal ?? undefined });
  const decidedCount = v.accepted.length + v.rejected.length;

  const multiGoal = v.userGoals.length > 1;

  /** One task: status, title, goal tags, progress or NEW, value */
  const renderItem = (o: Opportunity, last: boolean) => {
    const g = v.display(o);
    const inPlan = v.isInPlan(o);
    const done = v.stepsDone(o);
    const total = o.steps.length;
    const next = inPlan ? o.steps.find((_, i) => !(planMeta[o.id]?.stepsDone ?? []).includes(i)) : undefined;
    const goals = multiGoal ? v.goalsOf(o) : [];
    return (
      <TouchableOpacity
        key={o.id}
        style={[styles.row, last && { borderBottomWidth: 0 }]}
        onPress={() => open(o)}
        activeOpacity={0.75}
      >
        <Icon name={inPlan ? 'f:check-circle' : 'f:eye'} size={18} color={inPlan ? Colors.positive : Colors.accentHi} />
        <View style={{ flex: 1 }}>
          <MoveTag opp={o} />
          <Text style={styles.rowTitle}>{v.titleOf(o)}</Text>
          {o.teaser ? <Text style={styles.teaser}>{o.teaser}</Text> : null}
          {goals.length > 0 && (
            <View style={styles.chips}>
              {goals.map((id) => (
                <Text key={id} style={styles.chip}>{t(GOALS.find((x) => x.id === id)?.chip ?? '')}</Text>
              ))}
            </View>
          )}
          {inPlan ? (
            <Text style={styles.progressText}>
              {total ? t('{done} of {total} steps', { done, total }) : ''}
              {next ? `  ·  ${t('Next: {step}', { step: next.title })}` : ''}
            </Text>
          ) : v.isNew(o) ? (
            <Text style={styles.newBadge}>{t('NEW')}</Text>
          ) : null}
          {inPlan && !v.isSuggested(o) ? <Text style={styles.stale}>{t('No longer suggested for your profile')}</Text> : null}
        </View>
        {g.gainAmount > 0 ? <Text style={styles.rowGain}>+{money(g.gainAmount)}</Text> : null}
        <Icon name="f:chevron-right" size={16} color={Colors.slate} />
      </TouchableOpacity>
    );
  };

  return (
    <Screen>
      <TopBar label={t('My plan')} />
      <Headline accent={t('plan')}>{t('Your')}</Headline>

      {/* The plan in one picture — shared as an image */}
      {v.accepted.length > 0 && (
        <>
          <ShareFrame ref={shareRef} capturing={capturing} source={sources.join(' · ') || undefined}>
            <Card variant="positive">
              <Text style={styles.boostLabel}>{t('MY PLAN')}</Text>
              <Text style={styles.hero}>{headline}</Text>
              <Text style={styles.heroSub}>{subline}</Text>
              {heroItems.slice(0, 5).map((o) => {
                const g = v.display(o);
                return (
                  <View key={o.id} style={styles.heroRow}>
                    <Icon name="f:check-circle" size={16} color={Colors.positive} />
                    <Text style={styles.heroItem} numberOfLines={2}>{v.titleOf(o)}</Text>
                    {g.gainAmount > 0 ? <Text style={styles.heroGain}>+{money(g.gainAmount)}</Text> : null}
                  </View>
                );
              })}
            </Card>
          </ShareFrame>
          <View style={{ marginBottom: 14 }}>
            <Button label={t('Share my plan')} icon="f:share-2" onPress={sharePlan} loading={sharing} />
          </View>
        </>
      )}

      {/* Boost */}
      <Card>
        {/* Lead with the potential (what the whole plan could add); the line
            under it says how much of that is already in the plan. */}
        <Text style={styles.boostLabel}>{t('YOUR YEARLY BOOST POTENTIAL')}</Text>
        <Text style={styles.boost}>
          {v.potentialBoost <= 0 ? t('$0 so far')
            : v.pending.length ? t('Up to +{amount}/yr', { amount: money(v.potentialBoost) })
            : t('+{amount}/yr', { amount: money(v.potentialBoost) })}
        </Text>
        {v.potentialBoost > 0 ? (
          <Text style={styles.boostSub}>
            {!v.pending.length ? t('All of it is in your plan.')
              : v.planBoost > 0
                ? (v.pending.length === 1
                  ? t('+{amount}/yr of it is already in your plan. Review the one still open to add the rest.', { amount: money(v.planBoost) })
                  : t('+{amount}/yr of it is already in your plan. Review the {n} still open to add the rest.', { amount: money(v.planBoost), n: v.pending.length }))
                : (v.pending.length === 1
                  ? t('None of it is in your plan yet. Review the one still open to add it.')
                  : t('None of it is in your plan yet. Review the {n} still open to add them.', { n: v.pending.length }))}
          </Text>
        ) : null}
        <Text style={styles.note}>{t('Pay fixes and add-ons add up; career moves are alternatives, so only the best one counts.')}</Text>
      </Card>

      {/* The one task list, by effort: quick wins first */}
      {v.buckets.map((b) => {
        const info = EFFORT_INFO[b.effort];
        return (
          <View key={b.effort} style={styles.bucket}>
            <SectionLabel icon={info.icon}>{t(info.title)}</SectionLabel>
            <Text style={styles.bucketSub}>{t(info.sub)}</Text>
            <Card padded={false}>
              {b.items.map((o, i) => renderItem(o, i === b.items.length - 1))}
            </Card>
          </View>
        );
      })}
      {v.buckets.length > 0 && (
        <View style={styles.legend}>
          <Icon name="f:check-circle" size={12} color={Colors.positive} />
          <Text style={styles.legendText}>{t('in your plan')}</Text>
          <Icon name="f:eye" size={12} color={Colors.accentHi} />
          <Text style={styles.legendText}>{t('still to review')}</Text>
        </View>
      )}

      {v.accepted.length === 0 && v.pending.length > 0 && (
        <Text style={styles.empty}>{t('Nothing in your plan yet. Open a suggestion and tap "Add to my plan".')}</Text>
      )}

      {/* Done */}
      {v.done.length > 0 && (
        <>
          <SectionLabel icon="f:award">{t('Done ✓ ({n})', { n: v.done.length })}</SectionLabel>
          <Card padded={false}>
            {v.done.map((o, i) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.row, i === v.done.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => open(o)}
                activeOpacity={0.75}
              >
                <Icon name="f:check-circle" size={16} color={Colors.positive} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{v.titleOf(o)}</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </>
      )}

      {/* All suggestions */}
      <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('AllSuggestions')} activeOpacity={0.75}>
        <Icon name="f:list" size={16} color={Colors.accentHi} />
        <Text style={styles.linkText}>{t('All suggestions ({n})', { n: v.everything.length })}</Text>
        <Text style={styles.linkSub}>{decidedCount ? t('{n} not for me', { n: v.rejected.length }) : ''}</Text>
        <Icon name="f:chevron-right" size={16} color={Colors.slate} />
      </TouchableOpacity>

      {/* Job offers */}
      {wantsJobOffers !== true ? (
        <Card>
          <Text style={styles.itemTitle}>{t('Get job offers')}</Text>
          <Text style={styles.cardText}>{t('Anonymous offers that fit your pay, commute and job title. You decide who sees your name.')}</Text>
          <View style={{ marginTop: 10 }}>
            <Button label={t('Tell me more')} size="sm" variant="secondary" onPress={() => navigation.navigate('JobOfferOptIn', { edit: true })} />
          </View>
        </Card>
      ) : (
        <Text style={styles.on}>{t("Job offers: you're on the list (coming soon).")}</Text>
      )}

      {/* More goals — reachable, not in your face */}
      <TouchableOpacity onPress={() => navigation.navigate('GoalPicker', { edit: true, others: true })} activeOpacity={0.75}>
        <Text style={styles.addGoal}>{t('Want help with something else too? Add a goal')}</Text>
      </TouchableOpacity>

      {v.accepted.length === 0 && (
        <Button label={t('See where I stand')} variant="secondary" onPress={() => goTab(navigation, 'Standing')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { fontSize: 26, lineHeight: 31, fontFamily: Fonts.displayBlack, color: Colors.text, marginTop: 4 },
  heroSub: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginTop: 6, marginBottom: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: Colors.line },
  heroItem: { flex: 1, fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.text },
  heroGain: { fontSize: 14, fontFamily: Fonts.bold, color: Colors.positive },
  boostLabel: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 1.4, color: Colors.slate },
  boost: { fontSize: 32, fontFamily: Fonts.displayBlack, color: Colors.positive, marginTop: 2 },
  boostSub: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.textSoft, marginTop: 4 },
  note: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 6 },
  empty: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, marginBottom: 14 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemTitle: { flex: 1, fontSize: 16, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 21 },
  gain: { fontSize: 18, fontFamily: Fonts.displayBlack, color: Colors.positive },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(147,174,221,0.2)', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: Colors.positive },
  progressText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.positive, marginTop: 4 },
  next: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSoft, marginTop: 8 },
  bucket: { marginBottom: 8 },
  bucketSub: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSoft, marginTop: -4, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 5 },
  chip: {
    fontSize: 11, fontFamily: Fonts.semiBold, color: Colors.textSoft, borderWidth: 1, borderColor: Colors.line,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden',
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2, marginBottom: 10 },
  legendText: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginRight: 8 },
  addGoal: { fontSize: 14, fontFamily: Fonts.semiBold, color: Colors.accentHi, textAlign: 'center', marginVertical: 12 },
  stale: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.warning, marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line,
  },
  rowTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  teaser: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, marginTop: 2, lineHeight: 16 },
  rowGain: { fontSize: 16, fontFamily: Fonts.displayBlack, color: Colors.positive },
  newBadge: { alignSelf: 'flex-start', fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1, color: Colors.ink, backgroundColor: Colors.accentHi, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, marginTop: 4, overflow: 'hidden' },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.line, marginVertical: 12,
  },
  linkText: { flex: 1, fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  linkSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted },
  cardText: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 19, marginTop: 4 },
  on: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.muted, marginBottom: 12 },
});
