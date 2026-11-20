import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useFonts,
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import {
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  BarlowCondensed_900Black,
  BarlowCondensed_800ExtraBold_Italic,
  BarlowCondensed_900Black_Italic,
} from '@expo-google-fonts/barlow-condensed';

import AppNavigator, { startStateFor, type StartState } from './src/navigation/AppNavigator';
import { Colors } from './src/theme';
import { supabase } from './src/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { useAuthStore } from './src/store/authStore';
import { useUserStore } from './src/store/userStore';
import { loadProfileRow, discardPendingProfileSave } from './src/lib/profileSync';
import { loadSavedLanguage, rememberLanguage, useLangStore } from './src/i18n';
import { initAnalytics, identifyUser } from './src/lib/analytics';

// Usage analytics (off until a PostHog key is set in src/config/analytics.ts)
initAnalytics();

export default function App() {
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    BarlowCondensed_700Bold,
    BarlowCondensed_800ExtraBold,
    BarlowCondensed_900Black,
    BarlowCondensed_800ExtraBold_Italic,
    BarlowCondensed_900Black_Italic,
    // Preload icon fonts so line icons never flash in empty
    ...Feather.font,
    ...MaterialCommunityIcons.font,
  });

  const setSession = useAuthStore((s) => s.setSession);
  const hydrateFromProfileRow = useUserStore((s) => s.hydrateFromProfileRow);

  // Whose data is in the app right now. When the signed-in person changes
  // (sign-out, or signing in as someone else without signing out first),
  // everything from the previous user is wiped before the new user's saved
  // profile is loaded — nothing may carry over between users.
  const currentUser = React.useRef<string | null>(null);
  const restoredFor = React.useRef<string | null>(null);

  function switchUser(userId: string | null) {
    if (userId === currentUser.current) return;
    if (currentUser.current !== null) {
      discardPendingProfileSave();          // unsent edits belong to the previous user
      useUserStore.getState().reset();      // answers, location, pay, occupation…
      restoredFor.current = null;
    }
    currentUser.current = userId;
    identifyUser(userId);                   // analytics: events belong to this user (null = signed out)
  }

  // Restore everything the user saved (location, pay, schedule…) once per user.
  // Returns the saved row (null if already restored, missing, or failed).
  async function restoreProfile(userId: string) {
    if (restoredFor.current === userId) return null;
    restoredFor.current = userId;
    const row = await loadProfileRow(userId);
    // Ignore a late response if someone else signed in meanwhile
    if (row && currentUser.current === userId) hydrateFromProfileRow(row);
    return row;
  }

  function onSession(session: Session | null) {
    setSession(session);
    const userId = session?.user?.id ?? null;
    const signedIn = !!userId && userId !== currentUser.current;
    switchUser(userId);
    if (signedIn) rememberLanguage(userId);   // the language chosen at sign-in is kept for next time
    return userId ? restoreProfile(userId) : Promise.resolve(null);
  }

  // First screen on launch. Someone still signed in (Google, Apple or email —
  // users stay signed in until they log out) skips Welcome and continues where
  // they left off. null = still deciding (spinner).
  const [startState, setStartState] = React.useState<StartState | null>(null);

  // Keep auth state in sync with Supabase session
  // (the saved language is read first, so signing in never overwrites it with the phone's)
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    let alive = true;
    loadSavedLanguage().then(() => {
      if (!alive) return;
      supabase.auth.getSession()
        .then(async ({ data: { session } }) => {
          const restoring = onSession(session);
          if (!session) return startStateFor(null, null);
          // Don't keep a returning user on the spinner if the network is slow:
          // after 6 s fall back to Welcome (the old behaviour).
          const row = await Promise.race([
            restoring,
            new Promise<undefined>((r) => setTimeout(() => r(undefined), 6000)),
          ]);
          return row === undefined ? startStateFor(null, null) : startStateFor(session, row);
        })
        .catch(() => startStateFor(null, null))
        .then((start) => { if (alive) setStartState(start); });
      subscription = supabase.auth.onAuthStateChange((_event, session) => { onSession(session); }).data.subscription;
    });
    return () => { alive = false; subscription?.unsubscribe(); };
  }, []);

  const languageReady = useLangStore((s) => s.ready);

  if (!fontsLoaded || !languageReady || !startState) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.denimDark }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor={Colors.ink} />
        <AppNavigator initialState={startState} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
