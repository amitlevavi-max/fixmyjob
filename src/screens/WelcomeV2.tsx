import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  ImageBackground, StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { RootStackParamList } from '../navigation/AppNavigator';
import { resetToTabs } from '../lib/nav';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../store/userStore';
import BlueprintBackground from '../components/BlueprintBackground';
import Logo from '../components/Logo';
import AppMenu from '../components/AppMenu';
import Icon from '../components/Icon';
import Button from '../components/Button';
import LanguageToggle from '../components/LanguageToggle';
import { useT } from '../i18n';
import { Colors, Fonts, Radii, Spacing } from '../theme';

type Nav = StackNavigationProp<RootStackParamList, 'Welcome'>;

// Mixed line-up of workers (mechanic, nurse, warehouse, retail, delivery) —
// deliberately not construction-only. Placeholder cut from the design mockup;
// swap for a real photo any time (same name, ~1700×580 — if the shape differs,
// update aspectRatio in styles.heroWrap).
const HERO_IMAGE = require('../../assets/hero-workers.jpg');

// Closes the sign-in browser tab when Google redirects back to the app
WebBrowser.maybeCompleteAuthSession();

// Four "career toolbox" tiles (2×2). Information only — not buttons.
// `badge` is a small second icon laid over the main one.
const VALUE_TILES = [
  { n: 1, title: 'Earn More', caption: 'Practical ways to boost your pay', icon: 'cash-multiple', badge: 'trending-up', badgeColor: Colors.accentHi },
  { n: 2, title: 'Compare', caption: 'Compare your pay with your peers', icon: 'chart-bar', badge: 'scale-balance', badgeColor: Colors.text },
  { n: 3, title: 'Get Promoted', caption: 'Tailor your next career move', icon: 'stairs-up', badge: 'account-hard-hat', badgeColor: Colors.text },
  { n: 4, title: 'Know Your Rights', caption: 'Claim pay & other rights you\u2019re owed', icon: 'shield-check', badge: 'handshake', badgeColor: Colors.text },
];
const TILE_ROWS = [VALUE_TILES.slice(0, 2), VALUE_TILES.slice(2, 4)];

export default function WelcomeV2Screen() {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const [googleLoading, setGoogleLoading] = useState(false);
  const hydrateFromProfileRow = useUserStore((s) => s.hydrateFromProfileRow);

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

      // Open Google in an auth session that returns the redirect URL to us
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      if (result.type !== 'success') return;   // user closed the browser

      const userId = await completeSignIn(result.url);
      await routeAfterSignIn(userId);
    } catch (err: any) {
      Alert.alert(t('Google sign-in failed'), t(err.message || 'Please try again.'));
    } finally {
      setGoogleLoading(false);
    }
  }

  /** Turn the redirect URL (PKCE code or implicit tokens) into a session. */
  async function completeSignIn(returnUrl: string): Promise<string> {
    // Parse query + fragment by hand (React Native's URL support is partial)
    const params: Record<string, string> = {};
    for (const part of returnUrl.split(/[?#]/).slice(1).join('&').split('&')) {
      const [k, v = ''] = part.split('=');
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
    const errorText = params.error_description || params.error;
    if (errorText) throw new Error(errorText);
    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) throw error;
      return data.session.user.id;
    }
    const { access_token, refresh_token } = params;
    if (!access_token || !refresh_token) throw new Error('Sign-in finished but no session was returned.');
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error || !data.session) throw error ?? new Error('Could not start a session.');
    return data.session.user.id;
  }

  /** Continue where this user left off. Pay is required before any results. */
  async function routeAfterSignIn(userId: string) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    // Load saved answers first so the next screen has them (pay, location…)
    if (data) hydrateFromProfileRow(data);
    if (!data?.goal) navigation.navigate('GoalPicker');
    else if (!data.role || !data.annual_earnings) navigation.navigate('ManualEntry');
    else resetToTabs(navigation, 'Standing'); // returning users always land on Where I stand
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.ink} />
      <BlueprintBackground />

      <SafeAreaView style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Brand bar ─────────────────────────────────────────────── */}
          <View style={[styles.pad, styles.brandBar]}>
            <AppMenu><Logo size="md" tagline={false} /></AppMenu>
            <LanguageToggle compact />
          </View>

          {/* ── Hero: people from many kinds of work ────────────────────── */}
          <View style={styles.heroWrap}>
            <ImageBackground source={HERO_IMAGE} style={styles.hero} resizeMode="cover">
              <LinearGradient
                colors={[Colors.ink, 'rgba(10,22,40,0)']}
                style={styles.fadeTop}
              />
              <LinearGradient
                colors={['rgba(17,32,64,0)', 'rgba(17,32,64,0.75)', Colors.denimDark]}
                locations={[0, 0.6, 1]}
                style={styles.fadeBottom}
              />
            </ImageBackground>
          </View>

          {/* ── Headline (overlaps the bottom of the photo) ─────────────── */}
          <View style={[styles.pad, styles.headlineWrap]}>
            <Text style={styles.headline}>
              {t('GROW TOGETHER.')}{'\n'}
              <Text style={styles.headlineAccent}>{t('GO FURTHER.')}</Text>
            </Text>
          </View>

          {/* ── Value tiles (2×2) ────────────────────────────────────── */}
          <View style={[styles.pad, styles.tileGrid]}>
            {TILE_ROWS.map((row, r) => (
              <View key={r} style={styles.tileRow}>
                {row.map(({ n, title, caption, icon, badge, badgeColor }) => (
                  <LinearGradient
                    key={n}
                    colors={['rgba(36,67,138,0.55)', 'rgba(17,32,64,0.85)']}
                    style={styles.tile}
                  >
                    <View style={styles.tileTop}>
                      <Text style={styles.tileTitle} numberOfLines={2}>{t(title)}</Text>
                    </View>
                    <View style={styles.tileArt}>
                      <View style={styles.tileGlow} />
                      <Icon name={icon} size={50} color={Colors.accent} />
                      <View style={styles.tileBadge}>
                        <Icon name={badge} size={26} color={badgeColor} />
                      </View>
                    </View>
                    <View style={styles.tileCap}>
                      <Text style={styles.tileCapText}>{t(caption)}</Text>
                    </View>
                  </LinearGradient>
                ))}
              </View>
            ))}
          </View>

          {/* ── Actions ───────────────────────────────────────────────── */}
          <View style={[styles.pad, styles.actions]}>
            <Button
              label={t("Get started — it's free →")}
              onPress={() => navigation.navigate('SignUp')}
            />

            <TouchableOpacity
              style={styles.google}
              onPress={handleGoogleSignIn}
              disabled={googleLoading}
              activeOpacity={0.7}
            >
              {googleLoading ? (
                <ActivityIndicator color={Colors.text} size="small" />
              ) : (
                <>
                  <Icon name="google" size={20} color={Colors.text} />
                  <Text style={styles.googleText}>{t('Continue with Google')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signIn}
              onPress={() => navigation.navigate('SignIn')}
              activeOpacity={0.7}
            >
              <Text style={styles.signInText}>
                {t('Already have an account?')}{'  '}
                <Text style={styles.signInLink}>{t('Sign in')}</Text>
              </Text>
            </TouchableOpacity>

            <Text style={styles.legal}>
              {t('Free to use  ·  Your data is private  ·  US workers only')}
              {'\n'}{t('Independent app — not a government service')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.ink },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingTop: 10, paddingBottom: 18 },
  pad: { paddingHorizontal: Spacing.gutter },

  // Brand bar
  brandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tagline: {
    fontFamily: Fonts.displayItalic,
    fontSize: 15,
    lineHeight: 17,
    letterSpacing: 0.6,
    color: Colors.slate,
    textAlign: 'right',
    transform: [{ rotate: '-5deg' }],
  },

  // Hero
  heroWrap: {
    // Match the photo's shape so nobody in the line-up gets cropped off
    width: '100%',
    aspectRatio: 1672 / 568,
  },
  hero: {
    flex: 1,
  },
  fadeTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 36,
  },
  fadeBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 90,
  },

  // Headline
  headlineWrap: {
    marginTop: -46,
    marginBottom: 16,
  },
  headline: {
    fontFamily: Fonts.displayBlackItalic,
    fontSize: 44,
    lineHeight: 44,
    color: Colors.text,
    letterSpacing: 0.3,
    transform: [{ rotate: '-3deg' }],
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  headlineAccent: {
    color: Colors.accent,
  },

  // Value tiles (2×2)
  tileGrid: {
    gap: 10,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lineStrong,
    overflow: 'hidden',
  },
  tileTop: {
    minHeight: 32,
    paddingTop: 8,
    paddingHorizontal: 10,   // no number in the corner any more (Amit, 2026-10-27)
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontFamily: Fonts.display,
    fontSize: 19,
    lineHeight: 20,
    letterSpacing: 0.3,
    color: Colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  tileArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.accentSoft,
  },
  tileBadge: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: 10,
    marginTop: -32,
  },
  tileCap: {
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(10,22,40,0.78)',
    borderTopWidth: 1,
    borderTopColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCapText: {
    fontSize: 12,
    lineHeight: 15,
    fontFamily: Fonts.semiBold,
    color: Colors.textSoft,
    textAlign: 'center',
  },

  // Actions
  actions: {
    gap: 6,
    marginTop: 18,
  },
  google: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 48,
  },
  googleText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: Colors.text,
  },
  signIn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signInText: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: Colors.textSoft,
  },
  signInLink: {
    fontFamily: Fonts.bold,
    color: Colors.accent,
  },
  legal: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: Colors.faint,
    marginTop: 4,
  },
});
