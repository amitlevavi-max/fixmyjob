import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import IconTile from '../../components/IconTile';
import Icon from '../../components/Icon';
import Notice from '../../components/Notice';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { rightsCategories } from '../../data/rightsContent';
import { useUserStore } from '../../store/userStore';
import { Colors, Fonts, Radii } from '../../theme';

type Nav = StackNavigationProp<RootStackParamList, 'RightsHub'>;

export default function RightsHubScreen() {
  const navigation = useNavigation<Nav>();
  const { locationStateName } = useUserStore();

  return (
    <Screen
      footer={<Button label="See my opportunities →" onPress={() => navigation.navigate('InsightsSummary')} />}
    >
      <TopBar onBack={() => navigation.goBack()} label="Your rights" />

      <Eyebrow>Plain English · No jargon</Eyebrow>
      <Headline accent="you're owed">Know what</Headline>
      <Lead>
        Tap any category to see what {locationStateName ? `US and ${locationStateName}` : 'US'} law says you're entitled to.
      </Lead>

      <View style={styles.grid}>
        {rightsCategories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.card}
            onPress={() => navigation.navigate('RightsDetail', { categoryId: cat.id })}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <IconTile icon={cat.lineIcon} size={42} />
              <Icon name="f:arrow-up-right" size={18} color={Colors.accentHi} />
            </View>
            <Text style={styles.cardTitle}>{cat.label}</Text>
            <Text style={styles.cardSub} numberOfLines={2}>
              {cat.facts[0]?.key} + {cat.facts.length - 1} more
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Notice tone="success" icon="shield-check-outline" style={{ marginTop: 6 }}>
        These are your legal rights under US employment law — every worker is entitled to them.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
    marginBottom: 12,
  },
  card: {
    width: '48.5%',
    minHeight: 138,
    padding: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.card,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 19,
    lineHeight: 21,
    fontFamily: Fonts.display,
    textTransform: 'uppercase',
    color: Colors.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.muted,
    lineHeight: 16,
  },
});
