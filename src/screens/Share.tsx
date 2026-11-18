import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { goTab } from '../lib/nav';
import { useUserStore } from '../store/userStore';
import { useOpportunities } from '../lib/useOpportunities';
import Screen from '../components/Screen';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import Card from '../components/Card';
import Stat from '../components/Stat';
import Icon from '../components/Icon';
import IconTile from '../components/IconTile';
import Logo from '../components/Logo';
import ShareFrame from '../components/ShareFrame';
import ShareButton from '../components/ShareSheet';
import Notice from '../components/Notice';
import { Headline } from '../components/Typography';
import { Colors, Fonts } from '../theme';

type Nav = StackNavigationProp<RootStackParamList, 'Share'>;

const DONE = [
  'Pay compared with official BLS data',
  'Steps mapped out for every move you looked at',
  'Rights breakdown ready when you need it',
];

export default function ShareScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, earningsPercentile } = useUserStore();

  const percentile = earningsPercentile;
  const shareRef = useRef<View>(null);
  const [capturing, setCapturing] = useState(false);
  const { boost, plan, display } = useOpportunities();
  // Once the user has built a plan, the summary reflects that plan
  const usingPlan = plan.opportunities.length > 0;
  const uplift = Math.round((usingPlan ? plan.boost.total : boost.total) / 100) * 100;
  // The finding in words — printed in the shared picture and the message
  const shareCaption = uplift > 0
    ? `Fix My Job showed me how I could earn +$${uplift.toLocaleString()} more a year${percentile != null ? ` — I'm in the ${percentile}${ordinal(percentile)} percentile in my field` : ''}.`
    : 'Fix My Job showed me where I stand on pay and what I can do about it.';

  return (
    <Screen
      cornerMarks
      footer={
        <>
          <Button label="Explore more →" onPress={() => goTab(navigation, 'Plan')} />
          <GhostButton label="Start over" onPress={() => navigation.navigate('Welcome')} />
        </>
      }
    >
      <View style={styles.logo}>
        <Logo size="sm" tagline={false} />
      </View>

      {/* Result card */}
      <ShareFrame ref={shareRef} capturing={capturing} caption={shareCaption}>
      <Card variant="feature" ticks style={styles.result}>
        <Text style={styles.resultTag}>YOUR RESULT</Text>
        <Headline size="md" align="center" accent={percentile != null ? `${percentile}${ordinal(percentile)} percentile` : 'top tier'} accentBreak>
          You're in the
        </Headline>
        <Text style={styles.resultSub}>of workers in your field</Text>
        <View style={styles.rule} />
        <Stat
          value={`+$${uplift.toLocaleString()}`}
          suffix="/yr"
          label={usingPlan ? 'From the moves in your plan' : 'Reachable with the right moves'}
          size="lg"
          color={Colors.positive}
          align="center"
        />
      </Card>
      </ShareFrame>

      {/* The user's plan */}
      <Card>
        <Text style={styles.planTag}>YOUR PLAN</Text>
        {usingPlan ? (
          plan.opportunities.map((o, i) => {
            const g = display(o);
            return (
              <View key={o.id} style={[styles.planRow, i === plan.opportunities.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.planNum}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{o.title}</Text>
                  <Text style={styles.planSub}>{g.gain} · {o.timeline}</Text>
                </View>
                {g.gainAmount > 0 && <Text style={styles.planGain}>+${g.gainAmount.toLocaleString()}</Text>}
              </View>
            );
          })
        ) : (
          <Text style={styles.planEmpty}>You haven't added any opportunities to your plan yet.</Text>
        )}
        {plan.notPursuing.length > 0 && (
          <Text style={styles.planSkipped}>
            Not pursuing: {plan.notPursuing.map((o) => o.title).join(', ')}
          </Text>
        )}
        <GhostButton
          label={usingPlan ? 'Change my plan' : 'Pick opportunities'}
          onPress={() => goTab(navigation, 'Plan')}
          style={{ paddingBottom: 0 }}
        />
      </Card>

      {/* Checklist */}
      <Card>
        {DONE.map((d, i) => (
          <View key={d} style={[styles.doneRow, i === DONE.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={styles.doneTick}>
              <Icon name="f:check" size={14} color="#06220F" />
            </View>
            <Text style={styles.doneText}>{d}</Text>
          </View>
        ))}
      </Card>

      {/* Share */}
      <Card variant="accent">
        <View style={styles.shareHead}>
          <IconTile icon="account-group-outline" tone="accent" size={42} />
          <Text style={styles.shareTitle}>Know someone who'd benefit?</Text>
        </View>
        <Text style={styles.shareSub}>
          Share Fix My Job with a colleague and help them find their earning potential too.
        </Text>
        <View style={{ marginTop: 14 }}>
          <ShareButton
            label="Share with a colleague"
            captureRef={shareRef}
            onCapturing={setCapturing}
            screen="share"
            message={`${shareCaption} Find your own earning potential, free:`}
          />
        </View>
      </Card>

    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginTop: 4, marginBottom: 18 },
  result: { alignItems: 'center', paddingTop: 22, paddingBottom: 20 },
  resultTag: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 2, color: Colors.accentHi, marginBottom: 10 },
  resultSub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, marginTop: -4 },
  rule: { width: 48, height: 2, backgroundColor: Colors.lineStrong, marginVertical: 16 },
  planTag: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 2, color: Colors.accentHi, marginBottom: 6 },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.line,
  },
  planNum: { fontSize: 18, fontFamily: Fonts.displayBold, color: Colors.accentHi, width: 18 },
  planTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text },
  planSub: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.textSoft, marginTop: 2, lineHeight: 17 },
  planGain: { fontSize: 16, fontFamily: Fonts.displayBold, color: Colors.positive },
  planEmpty: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, paddingVertical: 6 },
  planSkipped: { fontSize: 12, fontFamily: Fonts.regular, color: Colors.slate, marginTop: 8, lineHeight: 17 },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.line,
  },
  doneTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { flex: 1, fontSize: 14, fontFamily: Fonts.medium, color: Colors.text },
  shareHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  shareTitle: { flex: 1, fontSize: 20, lineHeight: 22, fontFamily: Fonts.display, textTransform: 'uppercase', color: Colors.text },
  shareSub: { fontSize: 14, fontFamily: Fonts.regular, color: Colors.textSoft, lineHeight: 20 },
});

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
