import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useOpportunities } from '../lib/useOpportunities';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Icon from '../components/Icon';
import { Headline, Eyebrow, Lead } from '../components/Typography';
import { Colors, Fonts, Radii } from '../theme';

type Nav = StackNavigationProp<RootStackParamList>;

const DEMAND_LABEL: Record<string, { label: string; color: string }> = {
  low: { label: 'Low physical demand', color: Colors.positive },
  medium: { label: 'Medium physical demand', color: Colors.warning },
  high: { label: 'High physical demand', color: Colors.accentHi },
};

export default function OpportunityCardsScreen() {
  const navigation = useNavigation<Nav>();
  const { focusGoal: goal, planDecisions } = useUserStore();
  const { opportunities, display, plan } = useOpportunities();
  // One opportunity at a time: pick it, see its steps, decide, come back here
  const [selected, setSelected] = useState<string | null>(null);
  const decidedCount = Object.keys(planDecisions).length;

  function handleNext() {
    if (selected) navigation.navigate('NextSteps', { opportunityId: selected });
  }

  /** Finished deciding — rate the advice, then on to the summary */
  function handleDone() {
    const inPlan = plan.opportunities;
    navigation.navigate('AdviceFeedback', {
      opportunityId: inPlan.length ? `plan:${inPlan.map((o) => o.id).join(',')}` : 'plan:none',
      opportunityTitle: inPlan.length ? `Plan: ${inPlan.map((o) => o.title).join('; ')}` : 'Plan: nothing added',
    });
  }

  return (
    <Screen
      footer={
        <>
          <Button
            label={selected ? 'See the steps →' : 'Pick one to see its steps'}
            onPress={handleNext}
            disabled={!selected}
          />
          {decidedCount > 0 && (
            <GhostButton
              label={`Done — see my plan (${plan.opportunities.length} added)`}
              onPress={handleDone}
            />
          )}
        </>
      }
    >
      <TopBar label={`${opportunities.length} matches`} />

      <Eyebrow>Ranked by earning gain</Eyebrow>
      <Headline accent="opportunities">Your</Headline>
      <Lead>Pick one to see its steps, then add it to your plan or skip it. Come back here for the next one.</Lead>

      <View style={styles.list}>
        {opportunities.map((opp, i) => {
          const isSelected = selected === opp.id;
          const decision = planDecisions[opp.id];
          const demand = DEMAND_LABEL[opp.physicalDemand] || DEMAND_LABEL.medium;
          const g = display(opp);

          return (
            <TouchableOpacity
              key={opp.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => setSelected(opp.id)}
              activeOpacity={0.85}
            >
              <View style={styles.head}>
                <Text style={styles.rank}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={styles.title}>{opp.title}</Text>
                <View style={[styles.radio, isSelected && styles.radioOn]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              </View>

              {decision && (
                <View style={[styles.status, decision === 'in_plan' ? styles.statusIn : styles.statusOut]}>
                  <Icon
                    name={decision === 'in_plan' ? 'f:check-circle' : 'f:x-circle'}
                    size={13}
                    color={decision === 'in_plan' ? Colors.positive : Colors.slate}
                  />
                  <Text style={[styles.statusText, { color: decision === 'in_plan' ? Colors.positive : Colors.slate }]}>
                    {decision === 'in_plan' ? 'In your plan' : 'Not pursuing'}
                  </Text>
                </View>
              )}

              {g.gainAmount > 0 && (
                <View style={styles.gainRow}>
                  <Text style={styles.gain}>+${g.gainAmount.toLocaleString()}</Text>
                  <Text style={styles.gainUnit}>/yr</Text>
                </View>
              )}
              <Text style={styles.gainLabel}>{g.gain}</Text>
              {g.source ? <Text style={styles.source}>Source: {g.source}</Text> : null}

              <View style={styles.meta}>
                <View style={styles.pill}>
                  <Icon name="f:clock" size={13} color={Colors.slate} />
                  <Text style={styles.pillText}>{opp.timeline}</Text>
                </View>
                <View style={styles.pill}>
                  <Icon name="f:list" size={13} color={Colors.slate} />
                  <Text style={styles.pillText}>{opp.steps.length} steps</Text>
                </View>
                {goal === 'less_physical' && (
                  <View style={[styles.pill, { borderColor: demand.color }]}>
                    <Icon name="human-handsup" size={13} color={demand.color} />
                    <Text style={[styles.pillText, { color: demand.color }]}>{demand.label}</Text>
                  </View>
                )}
              </View>

              {opp.note ? <Text style={styles.note}>{opp.note}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  card: {
    padding: 16,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  cardSelected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(242,100,25,0.09)',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rank: { fontFamily: Fonts.displayBold, fontSize: 16, color: Colors.accentHi, paddingTop: 2 },
  title: {
    flex: 1,
    fontSize: 20,
    lineHeight: 22,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
  },
  radio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.accent },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderRadius: Radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginTop: 10,
  },
  statusIn: { borderColor: 'rgba(34,197,94,0.5)', backgroundColor: 'rgba(34,197,94,0.08)' },
  statusOut: { borderColor: Colors.line },
  statusText: { fontSize: 12, fontFamily: Fonts.semiBold },
  gainRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  gain: { fontSize: 34, lineHeight: 36, fontFamily: Fonts.displayBlack, color: Colors.positive },
  gainUnit: { fontSize: 15, fontFamily: Fonts.displayBold, color: Colors.slate, marginLeft: 2 },
  source: { fontSize: 11, fontFamily: Fonts.regular, color: Colors.faint, marginTop: 4 },
  gainLabel: { fontSize: 13, fontFamily: Fonts.regular, color: Colors.textSoft, marginTop: 2, lineHeight: 18 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.line,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.slate },
  note: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.muted,
    lineHeight: 17,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
});
