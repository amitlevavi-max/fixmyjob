import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Colors, Radii } from '../theme';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

// Required for expo-web-browser OAuth redirect handling on Android
WebBrowser.maybeCompleteAuthSession();

type Nav = StackNavigationProp<RootStackParamList, 'Welcome'>;

const VALUE_PROPS = [
  { icon: '📊', text: 'See where you rank vs. US peers' },
  { icon: '⚖️',  text: "Know every right you're entitled to" },
  { icon: '🚀', text: 'Get a personalised opportunity plan' },
];

export default function WelcomeScreen() {
  const navigation = useNavigation<Nav>();
  const { session, user } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [routing, setRouting] = useState(false);

  // When a session exists (after Google OAuth or email sign-in), route automatically
  useEffect(() => {
    if (!session || !user) return;

    setRouting(true);
    supabase
      .from('user_profiles')
      .select('goal, satisfaction, role, annual_earnings')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!data || !data.goal) {
          navigation.navigate('GoalPicker');
        } else if (!data.satisfaction) {
          navigation.navigate('JobSatisfaction');
        } else if (!data.role || !data.annual_earnings) {
          navigation.navigate('ManualEntry');
        } else {
          navigation.navigate('InsightsSummary');
        }
      })
      .catch(() => {
        navigation.navigate('GoalPicker');
      })
      .finally(() => setRouting(false));
  }, [session]);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const redirectUrl = Linking.createURL('/');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No auth URL received');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success') {
        const returnUrl = result.url;

        if (returnUrl.includes('code=')) {
          const { error: sessionError } = await supabase.auth.exchangeCodeForSession(returnUrl);
          if (sessionError) throw sessionError;
        } else {
          const fragment = returnUrl.includes('#')
            ? returnUrl.split('#')[1]
            : returnUrl.split('?')[1] ?? '';
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
          } else {
            throw new Error('Authentication completed but tokens were missing.');
          }
        }
      }
    } catch (err: any) {
      Alert.alert('Google Sign-In Failed', err.message || 'Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  if (routing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.denimDark }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={[Colors.denimDark, Colors.denimMid]}
        style={styles.gradient}
      >
        {/* Diagonal denim texture overlay */}
        <View style={styles.textureOverlay} pointerEvents="none" />

        <View style={styles.container}>

          {/* Brand */}
          <View style={styles.logoArea}>
            {/* Logo mark — orange circle with F */}
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkText}>F</Text>
            </View>

            {/* Wordmark: FIX MY JOB */}
            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmarkFix}>FIX MY </Text>
              <Text style={styles.wordmarkJob}>JOB</Text>
            </View>

            <Text style={styles.tagline}>Your next career move,{'\n'}calculated.</Text>
          </View>

          {/* Value props */}
          <View style={styles.propList}>
            {VALUE_PROPS.map((p) => (
              <View key={p.text} style={styles.propRow}>
                <Text style={styles.propIcon}>{p.icon}</Text>
                <Text style={styles.propText}>{p.text}</Text>
              </View>
            ))}
          </View>

          {/* Auth actions */}
          <View style={styles.actions}>
            {/* Primary CTA — safety orange */}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Get started — it's free →</Text>
            </TouchableOpacity>

            {/* Google — glass style */}
            <TouchableOpacity
              style={styles.googleBtn}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.googleIcon}>G</Text>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signInBtn}
              onPress={() => navigation.navigate('SignIn')}
              activeOpacity={0.7}
            >
              <Text style={styles.signInText}>
                Already have an account?{'  '}
                <Text style={styles.signInLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.legal}>
            Free to use · Your data is private · US workers only
          </Text>
          <Text style={styles.buildTag}>build 2026-09-21.E</Text>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.denimDark },
  gradient: { flex: 1 },
  // Subtle diagonal stripe overlay to hint at denim weave
  textureOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.04,
    backgroundColor: 'transparent',
    // React Native doesn't support repeating gradients, so we rely on
    // the solid dark navy + mid-blue gradient to evoke denim.
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },

  /* ── Brand ── */
  logoArea: {
    alignItems: 'center',
    paddingTop: 52,
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: Radii.xl,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  logoMarkText: {
    color: '#fff',
    fontSize: 38,
    fontFamily: 'BarlowCondensed_900Black',
    letterSpacing: -1,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  wordmarkFix: {
    fontSize: 42,
    fontFamily: 'BarlowCondensed_900Black',
    color: '#FFFFFF',
    letterSpacing: -1,
    lineHeight: 46,
  },
  wordmarkJob: {
    fontSize: 42,
    fontFamily: 'BarlowCondensed_900Black',
    color: Colors.accent,
    letterSpacing: -1,
    lineHeight: 46,
  },
  tagline: {
    fontSize: 17,
    fontFamily: 'Barlow_400Regular',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    lineHeight: 24,
  },

  /* ── Value props ── */
  propList: {
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 18,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  propIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  propText: {
    fontSize: 15,
    fontFamily: 'Barlow_500Medium',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
    flex: 1,
  },

  /* ── Actions ── */
  actions: { gap: 10 },
  primaryBtn: {
    height: 58,
    backgroundColor: Colors.accent,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 17,
    fontFamily: 'Barlow_700Bold',
    letterSpacing: 0.2,
  },
  // Glass button
  googleBtn: {
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.30)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleIcon: {
    fontSize: 17,
    fontFamily: 'BarlowCondensed_800ExtraBold',
    color: '#ffffff',
  },
  googleBtnText: {
    fontSize: 15,
    fontFamily: 'Barlow_600SemiBold',
    color: '#ffffff',
  },
  signInBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  signInText: {
    fontSize: 14,
    fontFamily: 'Barlow_400Regular',
    color: 'rgba(255,255,255,0.55)',
  },
  signInLink: {
    fontFamily: 'Barlow_700Bold',
    color: Colors.accent,
  },

  /* ── Footer ── */
  legal: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Barlow_400Regular',
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
  },
  buildTag: {
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Barlow_400Regular',
    color: 'rgba(255,255,255,0.2)',
    marginTop: 2,
  },
});
