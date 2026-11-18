/**
 * Profile → Union: the same question as inside the union action
 * (components/UnionMembershipQuestion). Being a member takes the union
 * suggestion away; "No" or "I don't know" brings it back.
 */
import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useUserStore } from '../store/userStore';
import { useUserUnion, isUnionMember, UNION_ID } from '../lib/unionMembership';
import { backToProfile } from '../lib/nav';
import Screen from '../components/Screen';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import GhostButton from '../components/GhostButton';
import UnionMembershipQuestion, { unionName } from '../components/UnionMembershipQuestion';
import { Headline, Lead } from '../components/Typography';
import { t } from '../i18n';

export default function UnionMembershipScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { unionMembership } = useUserStore();
  const union = useUserUnion();
  return (
    <Screen
      footer={
        <>
          <Button
            label={t('Done')}
            icon="f:check"
            onPress={() => (unionMembership ? backToProfile(navigation, 'Union') : navigation.goBack())}
          />
          {union && unionMembership && !isUnionMember(unionMembership) && (
            <GhostButton
              label={t('See how to join {union}', { union: unionName(union) })}
              onPress={() => navigation.navigate('NextSteps', { opportunityId: UNION_ID })}
            />
          )}
        </>
      }
    >
      <TopBar onBack={() => navigation.goBack()} label={t('Your answers')} />
      <Headline>{t('Union')}</Headline>
      <Lead style={{ marginBottom: 12 }}>{t('Tell us if you’re in a union, so we only suggest what’s useful to you.')}</Lead>
      <UnionMembershipQuestion />
    </Screen>
  );
}
