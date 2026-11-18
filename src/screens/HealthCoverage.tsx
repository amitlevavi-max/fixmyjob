/**
 * Profile → Health insurance: the same question as inside the health insurance
 * action (components/HealthCoverageQuestion). A change re-checks the action at
 * once: losing cover brings it back, being covered as well as most closes it.
 */
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useHealthInsurance, HEALTH_ID } from '../lib/healthInsurance';
import { backToProfile } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import HealthCoverageQuestion from '../components/HealthCoverageQuestion';
import { Headline, Lead } from '../components/Typography';
import { t } from '../i18n';

export default function HealthCoverageScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { healthCoverage } = useUserStore();
  const h = useHealthInsurance();
  return (
    <Screen
      footer={
        <>
          <Button
            label={t('Done')}
            icon="f:check"
            onPress={() => (healthCoverage ? backToProfile(navigation, 'Health insurance') : navigation.goBack())}
          />
          {h.status !== 'covered' && h.suggested && (
            <GhostButton label={t('See how to ask for it')} onPress={() => navigation.navigate('NextSteps', { opportunityId: HEALTH_ID })} />
          )}
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label={t('Your answers')} />
      <Headline>{t('Health insurance')}</Headline>
      <Lead style={{ marginBottom: 12 }}>
        {[h.why, t('Tell us what you have, and we’ll tell you if it’s worth asking your employer for more.')].filter(Boolean).join(' ')}
      </Lead>
      <HealthCoverageQuestion />
    </Screen>
  );
}
