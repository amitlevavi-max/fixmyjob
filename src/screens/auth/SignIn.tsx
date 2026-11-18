import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { resetToTabs } from '../../lib/nav';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { supabase } from '../../lib/supabase';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import Notice from '../../components/Notice';
import Icon from '../../components/Icon';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { Colors, Fonts } from '../../theme';
import { useT } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'SignIn'>;

export default function SignInScreen() {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const { signIn, isLoading, error, clearError } = useAuthStore();
  const { hydrateFromProfileRow } = useUserStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSignIn() {
    clearError();
    if (!email.trim()) return Alert.alert(t('Missing field'), t('Please enter your email.'));
    if (!password) return Alert.alert(t('Missing field'), t('Please enter your password.'));

    const success = await signIn(email.trim().toLowerCase(), password);
    if (!success) return;

    // Try to load existing profile from Supabase
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile) {
          // Restore everything saved — incl. location, pay and work schedule
          hydrateFromProfileRow(profile);

          // Pay is required for every result screen — ask for it if missing
          if (profile.annual_earnings) resetToTabs(navigation, 'Standing');
          else navigation.navigate(!profile.goal ? 'GoalPicker' : 'ManualEntry');
          return;
        }
      }
    } catch {
      // Profile not found or Supabase not yet configured — proceed to onboarding
    }

    // No profile yet → start onboarding
    navigation.navigate('GoalPicker');
  }

  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} />

      <Eyebrow>{t('Good to see you')}</Eyebrow>
      <Headline accent={t('back')}>{t('Welcome')}</Headline>
      <Lead>{t('Sign in to see your career insights and your plan.')}</Lead>

      {!!error && <Notice tone="danger">{t(error)}</Notice>}

      <View style={styles.form}>
        <TextField
          label={t('Email')}
          icon="f:mail"
          placeholder={t('your@email.com')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />
        <TextField
          label={t('Password')}
          icon="f:lock"
          placeholder={t('Your password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
          right={
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
              <Icon name={showPassword ? 'f:eye-off' : 'f:eye'} size={18} color={Colors.slate} />
            </TouchableOpacity>
          }
        />
      </View>

      <Button label={t('Sign in →')} onPress={handleSignIn} loading={isLoading} />

      <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('SignUp')}>
        <Text style={styles.switchText}>
          {t("Don't have an account?")}{'  '}
          <Text style={styles.switchHighlight}>{t('Create one')}</Text>
        </Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, marginBottom: 28 },
  switchLink: { alignItems: 'center', paddingVertical: 16 },
  switchText: { fontSize: 15, fontFamily: Fonts.regular, color: Colors.textSoft },
  switchHighlight: { fontFamily: Fonts.bold, color: Colors.accent },
});
