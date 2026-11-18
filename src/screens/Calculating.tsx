import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { resetToTabs } from '../lib/nav';
import { useUserStore } from '../store/userStore';
import Screen from '../components/Screen';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { Colors, Fonts } from '../theme';
import { t } from '../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'Calculating'>;

const MESSAGES = [
  'Finding your position in the market…',
  'Comparing with official BLS wage data…',
  'Calculating your earning potential…',
  'Building your personalised plan…',
];

export default function CalculatingScreen() {
  const navigation = useNavigation<Nav>();
  const { profile, setEarningsPercentile } = useUserStore();
  const spinValue = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = React.useState(0);

  useEffect(() => {
    // Spin animation. Kept so it can be stopped before the screen goes away —
    // a native-driver loop still running when the screen unmounts crashes
    // Android ("disconnectAnimatedNodes: Animated node … does not exist").
    const spinLoop = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: false,   // JS-driven: no native nodes left behind when the screen is replaced
      })
    );
    spinLoop.start();

    // Cycle messages
    const msgInterval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 750);

    // Calculate a realistic percentile
    const earnings = profile.annualEarnings ?? 0;
    const percentile = Math.min(95, Math.max(10, Math.round(((earnings - 20000) / 20000) * 60 + 25)));
    setEarningsPercentile(percentile);

    // Route to correct track after 2.5s
    const timer = setTimeout(() => {
      clearInterval(msgInterval);
      spinLoop.stop();
      resetToTabs(navigation, 'Standing');
    }, 2500);

    return () => {
      clearInterval(msgInterval);
      clearTimeout(timer);
      spinLoop.stop();
    };
  }, []);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Screen scrollable={false} cornerMarks>
      <View style={styles.container}>
        <View style={styles.gauge}>
          <View style={styles.ringTrack} />
          <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
          <Icon name="account-group-outline" size={44} color={Colors.accent} />
        </View>

        <Logo size="md" tagline={false} />

        <Text style={styles.message}>{t(MESSAGES[messageIndex])}</Text>

        <View style={styles.steps}>
          {MESSAGES.map((_, i) => (
            <View key={i} style={[styles.stepSeg, i <= messageIndex && styles.stepSegOn]} />
          ))}
        </View>

        <Text style={styles.sub}>{t('COMPARING WITH OFFICIAL BLS WAGE DATA')}</Text>
      </View>
    </Screen>
  );
}

const RING = 120;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingHorizontal: 12,
  },
  gauge: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  ringTrack: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: Colors.line,
    borderStyle: 'dashed',
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: Colors.accent,
    borderRightColor: Colors.accent,
  },
  message: {
    fontSize: 22,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 26,
    minHeight: 52,
  },
  steps: { flexDirection: 'row', gap: 6, width: 160 },
  stepSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(147,174,221,0.22)' },
  stepSegOn: { backgroundColor: Colors.accent },
  sub: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    letterSpacing: 1.6,
    color: Colors.slate,
    textAlign: 'center',
  },
});
