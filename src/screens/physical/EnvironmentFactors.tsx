import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useUserStore } from '../../store/userStore';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import GhostButton from '../../components/GhostButton';
import OptionCard from '../../components/OptionCard';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { t } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'EnvironmentFactors'>;

const FACTORS = [
  { id: 'outdoor', label: 'Outdoor / weather exposure', icon: 'weather-pouring' },
  { id: 'noise', label: 'Loud / noisy environment', icon: 'volume-high' },
  { id: 'cold', label: 'Cold storage / freezing temps', icon: 'snowflake' },
  { id: 'chemicals', label: 'Chemicals or dust exposure', icon: 'flask-outline' },
  { id: 'night_shifts', label: 'Night shifts or early starts', icon: 'weather-night' },
  { id: 'lone_working', label: 'Lone working / isolated', icon: 'account-outline' },
];

export default function EnvironmentFactorsScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'EnvironmentFactors'>>().params?.edit;
  const { setEnvironmentConcerns, environmentConcerns } = useUserStore();
  const [selected, setSelected] = useState<string[]>(editing ? environmentConcerns : []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleNext() {
    setEnvironmentConcerns(selected);
    navigation.navigate('PhysicalActivities', editing ? { edit: true } : undefined);
  }

  return (
    <Screen
      footer={
        <>
          <Button label={t('Next →')} onPress={handleNext} disabled={selected.length === 0} />
          <GhostButton label={t('Skip this')} onPress={handleNext} />
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} step={1} total={3} />

      <Eyebrow>{t('Wellbeing · Insight 1 of 3')}</Eyebrow>
      <Headline accent={t('you at work?')}>{t('What affects')}</Headline>
      <Lead>{t('Select the environment factors that concern you most.')}</Lead>

      <View style={styles.list}>
        {FACTORS.map((f) => (
          <OptionCard
            key={f.id}
            icon={f.icon}
            title={t(f.label)}
            mode="check"
            compact
            selected={selected.includes(f.id)}
            onPress={() => toggle(f.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
});
