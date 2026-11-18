import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore, goalsByImportance } from '../store/userStore';
import { titleForGoal } from '../data/opportunityCatalog';
import { useOpportunities } from '../lib/useOpportunities';
import { NLRB_ELECTIONS_URL } from '../data/unionDirectory';
import { useUserUnions, UNION_ID } from '../lib/unionMembership';
import UnionMembershipQuestion, { UnionBenefits } from '../components/UnionMembershipQuestion';
import { useUnionPremium, personalizeGain } from '../lib/benchmarks';
import { useMinimumWageCheck } from '../lib/useMinimumWageCheck';
import MinimumWageCheck from '../components/MinimumWageCheck';
import WageClaimLinks from '../components/WageClaimLinks';
import HelpUsCheck, { useQuestionProgress } from '../components/HelpUsCheck';
import ComingSoonButton from '../components/ComingSoonButton';
import RelocationExplorer, { RelocationJobLinks } from '../components/RelocationExplorer';
import { useRelocationGain } from '../lib/relocation';
import { useCertGapContext } from '../lib/certPay';
import TrainingOptions from '../components/TrainingOptions';
import CourseFinder from '../components/CourseFinder';
import DegreePrograms from '../components/DegreePrograms';
import ZipPrompt from '../components/ZipPrompt';
import { courseArea, useSearchPoint } from '../lib/home';
import { placeName } from '../lib/format';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import Icon from '../components/Icon';
import IconTile from '../components/IconTile';
import Notice from '../components/Notice';
import SectionLabel from '../components/SectionLabel';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';
import { t } from '../i18n';
import MoveTag from '../components/MoveTag';
import CourseDetails from '../components/CourseDetails';
import WidenCourseSearch from '../components/WidenCourseSearch';
import { COURSE_PREFIX, COURSE_SEARCH_ID, courseSearchItem } from '../lib/shortCourses';
import HealthCoverageQuestion from '../components/HealthCoverageQuestion';
import { HEALTH_ID } from '../lib/healthInsurance';

type Nav = StackNavigationProp<RootStackParamList, 'NextSteps'>;
type Route = RouteProp<RootStackParamList, 'NextSteps'>;

export default function NextStepsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { opportunityId, goal: openedFor } = route.params;
  const { goals, locationState, locationStateName, locationMetro, locationIsMetro, locationLabel, homePoint, profile, matchedOccupation, planDecisions, setPlanDecision, planMeta, setPlanMeta, setCredentialAnswer, courseMaxMiles } = useUserStore();
  const [zipSkipped, setZipSkipped] = useState(false);
  const [showZip, setShowZip] = useState(false);
  // Close the ZIP box once a ZIP is saved
  useEffect(() => { if (homePoint) setShowZip(false); }, [homePoint?.zip]);
  const area = courseArea({ homePoint, locationIsMetro, locationMetro, locationState, locationStateName });
  const searchPoint = useSearchPoint({ homePoint, locationIsMetro, locationMetro, locationState });

  // Catalog items, data-driven items (credentials, promotions, career changes) and older AI items
  const { all } = useOpportunities();
  // "Find a short course near you": while it searches again the item is not in the list; once a
  // course is found, that course is shown here instead (lib/shortCourses courseSearchItem)
  const isCourseSearch = opportunityId === COURSE_SEARCH_ID;
  const listed = all.find((o) => o.id === opportunityId);
  const foundCourse = isCourseSearch && !listed
    ? all.find((o) => o.id.startsWith(COURSE_PREFIX) && o.id !== COURSE_SEARCH_ID) : undefined;
  const courseSearching = isCourseSearch && !listed && !foundCourse;
  const opp = listed ?? foundCourse
    ?? (courseSearching ? courseSearchItem(courseMaxMiles, courseArea({ homePoint, locationIsMetro, locationMetro, locationState, locationStateName })?.label ?? null) : undefined);
  // Another promotion / career change already in the plan (only one of each is kept)
  const replaces = opp?.exclusiveGroup
    ? all.find((o) => o.id !== opp.id && o.exclusiveGroup === opp.exclusiveGroup && planDecisions[o.id] === 'in_plan')
    : undefined;
  const unionPremium = useUnionPremium(matchedOccupation?.soc);
  const unions = useUserUnions();
  const mw = useMinimumWageCheck();
  const reloc = useRelocationGain();
  const certGap = useCertGapContext(matchedOccupation?.soc, profile.annualEarnings ?? 0);
  // Official training programs (DOL) for this opportunity, when we know the occupation
  const trainingSoc = opp?.trainingSoc === 'current' ? matchedOccupation?.soc ?? null : opp?.trainingSoc ?? null;
  const meta = opp ? planMeta[opp.id] ?? {} : {};
  const completedSteps = meta.stepsDone ?? [];
  const [askReason, setAskReason] = useState(false);
  const [changingRating, setChangingRating] = useState(false);
  // First time this suggestion is opened (clears its "New" badge)
  useEffect(() => {
    if (opp && !planMeta[opp.id]?.firstSeen) setPlanMeta(opp.id, { firstSeen: new Date().toISOString() });
  }, [opp?.id]);


  if (!opp) {
    return (
      <Screen>
        <TopBar onBack={() => navigation.goBack()} />
        <Headline>{t('Opportunity not found')}</Headline>
        <Button label={t('Back')} variant="secondary" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  function toggleStep(idx: number) {
    const next = completedSteps.includes(idx) ? completedSteps.filter((x) => x !== idx) : [...completedSteps, idx];
    setPlanMeta(opp!.id, { stepsDone: next });
  }

  const decision = planDecisions[opp.id];

  /** Record the choice and go back to the list for the next opportunity */
  function rate(r: 'not' | 'somewhat' | 'very') {
    setPlanMeta(opp!.id, { rating: r });
    setChangingRating(false);
  }

  /** "Not for me" asks why (optional) before saving */
  function notForMe(reason?: string) {
    setAskReason(false);
    if (reason) setPlanMeta(opp!.id, { reason });
    decide('not_pursuing');
  }

  function decide(d: 'in_plan' | 'not_pursuing') {
    setPlanDecision(opp!.id, d);
    navigation.goBack();
  }

  /** The user already holds this credential: remember it (it then leaves the plan and suggestions) */
  function alreadyHave() {
    if (!opp?.credentialName) return;
    setCredentialAnswer(opp.credentialName, true);
    if (planDecisions[opp.id]) setPlanDecision(opp.id, null);
    navigation.goBack();
  }

  // What to search the web for: the course named by the opportunity, or the user's own job's certification
  const courseQuery = opp.courseKeyword
    ?? (opp.trainingSoc === 'current' && matchedOccupation ? `${matchedOccupation.title} certification or license training` : null);

  const progressPct = completedSteps.length / opp.steps.length;
  const g = personalizeGain(opp, profile.annualEarnings ?? 0, unionPremium, {
    minWageShortfall: mw.annualShortfall, minWage: mw.minimum.rate, baseHourly: mw.baseHourly,
    relocation: reloc.top
      ? { gain: reloc.gain, place: reloc.top.place.short, realPct: reloc.top.realPct, vsYouPct: reloc.top.vsYouPct }
      : reloc.ready ? { gain: 0, place: '', realPct: 0 } : null,
    certGap,
  });
  const showWageCheck = opp.id === 'minimum-wage-check' || opp.id === 'wage-theft-claim' || opp.id === 'right:minimum_wage';
  // Claim my rights items (lib/rightsCheck): "Help us check" questions on top
  const rightId = opp.id.startsWith('right:') ? opp.id.slice('right:'.length) : null;

  return (
    <Screen
      footer={
        <>
          <Button
            label={t(decision === 'in_plan' ? 'Keep it in my plan →' : replaces ? 'Choose this one instead →' : 'Add to my plan →')}
            icon="f:check"
            onPress={() => decide('in_plan')}
          />
          {opp.credentialName && (
            <GhostButton label={t('I already have this')} onPress={alreadyHave} />
          )}
          <GhostButton
            label={t(decision === 'not_pursuing' ? 'Keep as not pursuing' : 'Not for me — skip this one')}
            onPress={() => setAskReason(true)}
          />
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label={t('Opportunity')} />
      {decision && (
        <Notice tone={decision === 'in_plan' ? 'success' : 'info'} icon={decision === 'in_plan' ? 'f:check-circle' : 'f:x-circle'}>
          {decision === 'in_plan'
            ? t('This is in your plan. Choose "Not for me" below to take it out.')
            : t('You marked this as not pursuing. Add it to your plan below if you changed your mind.')}
        </Notice>
      )}

      {replaces && decision !== 'in_plan' && (
        <Notice tone="info" icon="f:info">
          {opp.exclusiveGroup === 'promotion'
            ? t('Your plan has one promotion: {title}. Choosing this one replaces it.', { title: replaces.title })
            : t('Your plan has one career change: {title}. Choosing this one replaces it.', { title: replaces.title })}
        </Notice>
      )}

      {g.gainAmount > 0 && (
        <Eyebrow color={Colors.positive}>{t('+{amount}/yr potential', { amount: `$${g.gainAmount.toLocaleString()}` })}</Eyebrow>
      )}
      <MoveTag opp={opp} style={{ marginTop: 2 }} />
      <Headline>{titleForGoal(opp, openedFor ?? goalsByImportance(goals).map((g) => g.id))}</Headline>
      <Lead style={{ marginBottom: g.source ? 4 : 12 }}>{g.gain}</Lead>
      {g.source ? <Text style={styles.source}>{t('Source: {source}', { source: g.source })}</Text> : null}

      <View style={styles.metaRow}>
        <View style={styles.pill}>
          <Icon name="f:clock" size={13} color={Colors.slate} />
          <Text style={styles.pillText}>{opp.timeline}</Text>
        </View>
        <View style={styles.pill}>
          <Icon name="f:list" size={13} color={Colors.slate} />
          <Text style={styles.pillText}>{t('{n} steps', { n: opp.steps.length })}</Text>
        </View>
        {rightId && <QuestionsPill rightId={rightId} />}
      </View>

      {rightId && <HelpUsCheck rightId={rightId} />}
      {showWageCheck && <MinimumWageCheck />}
      {opp.id === HEALTH_ID && <HealthCoverageQuestion />}
      {opp.id === UNION_ID && <UnionMembershipQuestion />}
      {opp.id === 'move-high-wage' && <RelocationExplorer />}
      {opp.course && <CourseDetails course={opp.course} />}
      {opp.courseSearch && <WidenCourseSearch searching={courseSearching} />}

      {!opp.courseSearch && (<>
      {/* Progress */}
      <View style={styles.progressHead}>
        <SectionLabel>{t('Your steps')}</SectionLabel>
      </View>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>
          {t('{done}/{total} done', { done: completedSteps.length, total: opp.steps.length })}
        </Text>
      </View>

      {/* Steps */}
      <View style={styles.stepsList}>
        {opp.steps.map((step, i) => {
          const done = completedSteps.includes(i);
          return (
            <React.Fragment key={i}>
            <TouchableOpacity
              style={[styles.stepCard, done && styles.stepCardDone]}
              onPress={() => toggleStep(i)}
              activeOpacity={0.8}
            >
              <View style={[styles.stepNum, done && styles.stepNumDone]}>
                {done
                  ? <Icon name="f:check" size={15} color="#06220F" />
                  : <Text style={styles.stepNumText}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepText, done && styles.stepTextDone]}>{step.title}</Text>
                {!done && step.detail ? <Text style={styles.stepDetail}>{step.detail}</Text> : null}
              </View>
            </TouchableOpacity>
            {step.action === 'report_wage_claim' && <WageClaimLinks />}
            {step.action === 'lawyer_soon' && !done && (
              <ComingSoonButton feature="talk_to_lawyer" icon="f:briefcase" label={t('Talk to a lawyer')} screen="task_detail" context={opp.id} />
            )}
            {step.url && !done && (
              <Text style={styles.stepLink} onPress={() => Linking.openURL(step.url!)}>{t('Open the official page')} ›</Text>
            )}
            {step.action === 'relocation_jobs' && !done && <RelocationJobLinks />}
            </React.Fragment>
          );
        })}
      </View>
      </>)}

      {opp.id === UNION_ID && unions.length > 0 && (() => {
        return (
          <View style={{ marginBottom: 6 }}>
            <SectionLabel icon="handshake-outline">
              {profile.role ? t('Unions for {work}', { work: profile.role }) : t('Unions for your work')}
            </SectionLabel>
            {unions.map((u, i) => (
              <Card key={u.id} variant={i === 0 ? 'accent' : 'default'}>
                <View style={styles.unionHead}>
                  <IconTile icon="handshake-outline" tone={i === 0 ? 'accent' : 'default'} size={42} />
                  <View style={{ flex: 1 }}>
                    {(i === 0 || u.states) && (
                      <Text style={styles.unionTag}>
                        {[i === 0 ? t('BEST MATCH') : null, u.states ? t('IN YOUR STATE') : null].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <Text style={styles.unionName}>{u.short}</Text>
                    <Text style={styles.unionFull}>{u.name}</Text>
                  </View>
                </View>
                <Text style={styles.unionCovers}>{t(u.covers)}</Text>
                <View style={styles.courseActions}>
                  <Button
                    label={t('Visit {name}', { name: u.short })}
                    icon="f:external-link"
                    size="sm"
                    variant={i === 0 ? 'primary' : 'secondary'}
                    onPress={() => Linking.openURL(u.url)}
                    style={{ flex: 1 }}
                  />
                  {u.organizeUrl && (
                    <Button
                      label={t('Organize')}
                      size="sm"
                      variant="secondary"
                      onPress={() => Linking.openURL(u.organizeUrl!)}
                    />
                  )}
                </View>
              </Card>
            ))}
            <UnionBenefits />
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => Linking.openURL(NLRB_ELECTIONS_URL)}
              activeOpacity={0.7}
            >
              <Icon name="scale-balance" size={16} color={Colors.accentHi} />
              <Text style={styles.linkText}>
                <Text style={styles.linkStrong}>{t('NLRB: how union elections work')}</Text>
              </Text>
              <Icon name="f:external-link" size={14} color={Colors.slate} />
            </TouchableOpacity>
          </View>
        );
      })()}

      {opp.note && !opp.courseSearch && <Notice tone="accent">{opp.note}</Notice>}


      {/* ── Training: approved programs (DOL) + providers found by web search ── */}
      {/* Search where the user already told us they work (metro or state);
          a ZIP code is only an optional refinement. Without any location we
          ask for the ZIP up front. */}
      {(trainingSoc || courseQuery) && (!area ? !zipSkipped : true) && (
        !area || showZip ? (
          <ZipPrompt
            reason={t('To find training near you')}
            onSkip={() => (area ? setShowZip(false) : setZipSkipped(true))}
            skipLabel={t(area ? 'Cancel' : 'Skip')}
            compact={!!area}
          />
        ) : (
          <TouchableOpacity style={styles.zipLink} onPress={() => setShowZip(true)} activeOpacity={0.7}>
            <Icon name="f:map-pin" size={14} color={Colors.accentHi} />
            <Text style={styles.zipLinkText}>
              {homePoint
                ? t('Searching near ZIP {zip} · change', { zip: homePoint.zip })
                : t('Searching near {place} · add your ZIP code for closer results', { place: placeName(locationLabel) })}
            </Text>
          </TouchableOpacity>
        )
      )}
      {/* A move that needs a college degree: programs at that level (Scorecard + IPEDS) */}
      {opp.degreeLevel && opp.targetSoc ? (
        <DegreePrograms
          soc={opp.targetSoc}
          who={opp.targetPlural ?? opp.targetTitle ?? ''}
          level={opp.degreeLevel}
          state={locationState}
          stateName={locationStateName}
          point={searchPoint}
        />
      ) : trainingSoc && (
        <TrainingOptions
          soc={trainingSoc}
          title={opp.trainingSoc === 'current' ? matchedOccupation?.title : null}
          state={locationState}
          stateName={locationStateName}
          point={searchPoint}
        />
      )}
      {courseQuery && area && !opp.degreeLevel && (
        <CourseFinder course={courseQuery} area={area} />
      )}
      {/* ── How useful is this suggestion? ── */}
      <View style={styles.rateBox}>
        {meta.rating && !changingRating ? (
          <Text style={styles.rateDone}>
            {`${t('You rated this: {rating}', { rating: t(RATING_LABEL[meta.rating]) })} · `}
            <Text style={styles.rateChange} onPress={() => setChangingRating(true)}>{t('Change')}</Text>
          </Text>
        ) : (
          <>
            <Text style={styles.rateQ}>{t('How useful is this suggestion?')}</Text>
            <View style={styles.rateRow}>
              {(['not', 'somewhat', 'very'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rateBtn, meta.rating === r && styles.rateBtnOn]}
                  onPress={() => rate(r)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rateBtnText}>{t(RATING_LABEL[r])}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      {/* ── "Not for me" — why? (optional) ── */}
      <Modal visible={askReason} transparent animationType="slide" onRequestClose={() => setAskReason(false)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setAskReason(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('Not for you — can we ask why?')}</Text>
            <Text style={styles.sheetSub}>{t('Optional. It helps us suggest better.')}</Text>
            {REASONS.map((r) => (
              <TouchableOpacity key={r} style={styles.reason} onPress={() => notForMe(r)} activeOpacity={0.8}>
                <Text style={styles.reasonText}>{t(r)}</Text>
              </TouchableOpacity>
            ))}
            <GhostButton label={t('Skip')} onPress={() => notForMe()} />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Screen>
  );
}

const RATING_LABEL: Record<'not' | 'somewhat' | 'very', string> = {
  not: '👎 Not useful', somewhat: '😐 Somewhat', very: '👍 Very useful',
};
const REASONS = ['Not interested', 'Too expensive', 'Not realistic for me', 'Already doing it', 'Other'];


/** Top of a rights task: how many questions it takes to check it */
function QuestionsPill({ rightId }: { rightId: string }) {
  const { total, left } = useQuestionProgress(rightId);
  if (!total) return null;
  return (
    <View style={[styles.pill, { borderColor: Colors.accentLine }]}>
      <Icon name="f:help-circle" size={13} color={Colors.accentHi} />
      <Text style={[styles.pillText, { color: Colors.accentHi }]}>
        {left === 0
          ? t('All questions answered')
          : total === 1 ? t('1 question to answer') : t('{n} questions · {left} left', { n: total, left })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepLink: { fontFamily: Fonts.bold, fontSize: 13, color: Colors.accentHi, marginTop: -4, marginBottom: 10, marginLeft: 46 },
  rateBox: { marginTop: 10, marginBottom: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.line },
  rateQ: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 10 },
  rateRow: { flexDirection: 'row', gap: 8 },
  rateBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.lineStrong },
  rateBtnOn: { borderColor: Colors.accentHi, backgroundColor: 'rgba(255,138,61,0.12)' },
  rateBtnText: { fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.text },
  rateDone: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.muted },
  rateChange: { fontFamily: Fonts.bold, color: Colors.accentHi },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(5,10,20,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.denimDark, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: Colors.lineStrong, padding: 22, paddingBottom: 30,
  },
  sheetTitle: { fontSize: 20, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  sheetSub: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.slate, marginTop: 4, marginBottom: 12 },
  zipLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 6 },
  zipLinkText: { flex: 1, fontSize: 13, fontFamily: Fonts.semiBold, color: Colors.accentHi },
  reason: { paddingVertical: 13, paddingHorizontal: 14, borderRadius: Radii.lg, borderWidth: 1, borderColor: Colors.line, marginBottom: 8 },
  reasonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginBottom: 14 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.slate },

  progressHead: { marginBottom: -4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(147,174,221,0.2)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: Colors.positive },
  progressLabel: { fontSize: 12, fontFamily: Fonts.bold, color: Colors.positive },

  stepsList: { gap: 8, marginBottom: 14 },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  stepCardDone: { borderColor: 'rgba(34,197,94,0.5)', backgroundColor: 'rgba(34,197,94,0.06)' },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumDone: { backgroundColor: Colors.positive, borderColor: Colors.positive },
  stepNumText: { fontSize: 15, fontFamily: Fonts.displayBold, color: Colors.accentHi },
  stepText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, lineHeight: 21, paddingTop: 3 },
  stepTextDone: { color: Colors.muted, textDecorationLine: 'line-through' },
  stepDetail: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 18, marginTop: 3 },

  courseHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  courseTitle: { flex: 1, fontSize: 20, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  courseSub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20 },
  courseActions: { flexDirection: 'row', gap: 10, marginTop: 14 },

  unionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  unionTag: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 1.5, color: Colors.accentHi, marginBottom: 2 },
  unionName: { fontSize: 22, lineHeight: 24, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  unionFull: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted },
  unionCovers: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.textSoft, lineHeight: 20 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.lineStrong,
    marginBottom: 8,
  },
  linkText: { flex: 1, fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft },
  linkStrong: { fontFamily: Fonts.semiBold, color: Colors.text },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontFamily: Fonts.medium, color: Colors.muted },
  errText: { fontSize: 13, fontFamily: Fonts.medium, color: Colors.textSoft, lineHeight: 19 },
  retry: { fontSize: 13, fontFamily: Fonts.bold, color: Colors.accentHi, marginTop: 6 },

  disclaimer: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17, marginBottom: 10 },
  courseCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  courseRank: { fontSize: 16, fontFamily: Fonts.displayBold, color: Colors.accentHi, width: 26, paddingTop: 1 },
  courseName: { fontSize: 15, fontFamily: Fonts.bold, color: Colors.text, lineHeight: 20 },
  courseProvider: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.muted, lineHeight: 17 },
  courseTuition: { fontSize: 22, fontFamily: Fonts.displayBlack, color: Colors.positive, textAlign: 'right' },
  courseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.slate },
  urlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  courseUrl: { fontSize: 12, fontFamily: Fonts.medium, color: Colors.primaryOnDark, textDecorationLine: 'underline' },
});
