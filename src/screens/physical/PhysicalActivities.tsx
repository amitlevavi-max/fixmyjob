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

type Nav = StackNavigationProp<RootStackParamList, 'PhysicalActivities'>;

const ACTIVITIES = [
  { id: 'heavy_lifting', label: 'Heavy lifting (50 lb+)', icon: 'weight-lifter' },
  { id: 'standing', label: 'Standing 8+ hours a day', icon: 'human-male' },
  { id: 'repetitive', label: 'Repetitive hand/arm movements', icon: 'repeat' },
  { id: 'driving', label: 'Driving long distances', icon: 'truck-outline' },
  { id: 'heights', label: 'Working at height', icon: 'ladder' },
  { id: 'bending', label: 'Constant bending or kneeling', icon: 'human-handsup' },
];

export default function PhysicalActivitiesScreen() {
  const navigation = useNavigation<Nav>();
  const editing = !!useRoute<RouteProp<RootStackParamList, 'PhysicalActivities'>>().params?.edit;
  const { setPhysicalConcerns, physicalConcerns } = useUserStore();
  const [selected, setSelected] = useState<string[]>(editing ? physicalConcerns : []);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleNext() {
    setPhysicalConcerns(selected);
    navigation.navigate('PrimaryConcern', editing ? { edit: true } : undefined);
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
      <TopBar onBack={() => navigation.goBack()} step={2} total={3} />

      <Eyebrow>{t('Wellbeing · Insight 2 of 3')}</Eyebrow>
      <Headline accent={t('demands')}>{t('Physical')}</Headline>
      <Lead>{t('Which of these describe your current job?')}</Lead>

      <View style={styles.list}>
        {ACTIVITIES.map((a) => (
          <OptionCard
            key={a.id}
            icon={a.icon}
            title={t(a.label)}
            mode="check"
            compact
            selected={selected.includes(a.id)}
            onPress={() => toggle(a.id)}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
});
