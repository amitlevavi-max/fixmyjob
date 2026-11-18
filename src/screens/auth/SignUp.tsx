import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { useAuthStore } from '../../store/authStore';
import Screen from '../../components/Screen';
import TopBar from '../../components/TopBar';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import Notice from '../../components/Notice';
import Icon from '../../components/Icon';
import { Headline, Eyebrow, Lead } from '../../components/Typography';
import { Colors, Fonts } from '../../theme';
import { t } from '../../i18n';

type Nav = StackNavigationProp<RootStackParamList, 'SignUp'>;

export default function SignUpScreen() {
  const navigation = useNavigation<Nav>();
  const { signUp, isLoading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function handleSignUp() {
    clearError();

    if (!username.trim()) {
      return Alert.alert(t('Missing field'), t('Please enter your name.'));
    }
    if (!email.trim() || !email.includes('@')) {
      return Alert.alert(t('Invalid email'), t('Please enter a valid email address.'));
    }
    if (password.length < 8) {
      return Alert.alert(t('Weak password'), t('Password must be at least 8 characters.'));
    }
    if (password !== confirmPassword) {
      return Alert.alert(t('Password mismatch'), t('Your passwords do not match.'));
    }

    try {
      await signUp(email.trim().toLowerCase(), password, username.trim());
      navigation.navigate('GoalPicker');
    } catch {
      // error is already set in the store and displayed below
    }
  }

  const eye = (
    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
      <Icon name={showPassword ? 'f:eye-off' : 'f:eye'} size={18} color={Colors.slate} />
    </TouchableOpacity>
  );

  return (
    <Screen>
      <TopBar onBack={() => navigation.goBack()} label={t('Free account')} />

      <Eyebrow>{t('Takes 30 seconds · No card needed')}</Eyebrow>
      <Headline accent={t('account')}>{t('Create your')}</Headline>
      <Lead>{t('Save your results and pick up where you left off on any device.')}</Lead>

      {!!error && <Notice tone="danger">{t(error)}</Notice>}

      <View style={styles.form}>
        <TextField
          label={t('Name')}
          icon="f:user"
          placeholder={t('e.g. Maria')}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="words"
          textContentType="givenName"
          autoComplete="name-given"
          autoCorrect={false}
          returnKeyType="next"
        />
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
          placeholder={t('Min. 8 characters')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          returnKeyType="next"
          right={eye}
        />
        <TextField
          label={t('Confirm password')}
          icon="f:lock"
          placeholder={t('Repeat your password')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          returnKeyType="done"
          onSubmitEditing={handleSignUp}
        />
      </View>

      <Button label={t('Create account →')} onPress={handleSignUp} loading={isLoading} />

      <TouchableOpacity style={styles.switchLink} onPress={() => navigation.navigate('SignIn')}>
        <Text style={styles.switchText}>
          Already have an account?{'  '}
          <Text style={styles.switchHighlight}>{t('Sign in')}</Text>
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
