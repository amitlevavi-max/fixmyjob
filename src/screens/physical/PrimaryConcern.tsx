import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { backToProfile } from '../../lib/nav';
import { useUserStore } from '../../store/userStore';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import OptionCard from '../../components/OptionCard';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { t } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'PrimaryConcern'>;

const CONCERNS = [
  { id: 'injury_risk', label: 'Risk of injury', icon: 'bandage', sub: 'Accidents, strains or long-term damage' },
  { id: 'fatigue', label: 'Physical exhaustion', icon: 'sleep', sub: 'Not recovering properly between shifts' },
  { id: 'health_future', label: 'Long-term health', icon: 'heart-pulse', sub: 'How this job affects me in 10+ years' },
  { id: 'commute', label: 'Commute and travel', icon: 'bus', sub: 'Time and cost getting to work' },
  { id: 'work_life', label: 'Work-life balance', icon: 'scale-balance', sub: 'Not enough time for family or rest' },
];

export default function PrimaryConcernScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'PrimaryConcern'>>().params?.edit;
  const { setPrimaryConcern, primaryConcern } = useUserStore();
  const [selected, setSelected] = useState<string | null>(editing ? primaryConcern : null);

  function handleNext() {
    if (selected) setPrimaryConcern(selected);
    if (editing) backToProfile(navigation, 'Physical strain');
    else navigation.navigate('InsightsSummary');
  }

  return (
    <Screen footer={<Button label={t(editing ? 'Save' : 'See my options →')} onPress={handleNext} disabled={!selected} />}>
      <TopBar onBack={() => navigation.goBack()} step={3} total={3} />

      <Eyebrow>{t('Wellbeing · Insight 3 of 3')}</Eyebrow>
      <Headline accent={t('most to you?')}>{t('What matters')}</Headline>
      <Lead>{t('Pick the one thing you\'d most like to improve.')}</Lead>

      <View style={styles.list}>
        {CONCERNS.map((c) => (
          <OptionCard
            key={c.id}
            icon={c.icon}
            title={t(c.label)}
            subtitle={t(c.sub)}
            selected={selected === c.id}
            onPress={() => setSelected(c.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
});
