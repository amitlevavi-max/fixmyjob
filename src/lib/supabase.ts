import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { safeFetch } from './safeFetch';

// ⚠️  SETUP REQUIRED — replace these with your actual values from:
//    Supabase Dashboard → Project Settings → API
const SUPABASE_URL = 'https://nebgfohbxsdcthvrlipm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_W5uhS6oxIAv4z_fXt485-g_Qd7Vhp26';

// SecureStore adapter (replaces AsyncStorage for auth tokens on device)
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoSecureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // React Native's fetch crashes the app on a dropped connection (status 0) — see lib/safeFetch
  global: { fetch: safeFetch },
});

// Helper: save specific fields immediately (call from each onboarding step)
export async function savePartialProfile(
  userId: string,
  fields: {
    goal?: string | null;
    satisfaction?: number | null;
    role?: string;
    years_experience?: number;
    annual_earnings?: number;
    employer?: string;
    location?: string;
    skills?: string[];
  }
) {
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
  return error;
}

// Helper: save or update user profile after onboarding
export async function upsertUserProfile(params: {
  userId: string;
  username?: string;
  goal?: string | null;
  satisfaction?: number | null;
  role?: string;
  yearsExperience?: number;
  annualEarnings?: number;
  employer?: string;
  location?: string;
  skills?: string[];
}) {
  const { userId, ...rest } = params;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      goal: rest.goal,
      satisfaction: rest.satisfaction,
      role: rest.role,
      years_experience: rest.yearsExperience,
      annual_earnings: rest.annualEarnings,
      employer: rest.employer,
      location: rest.location,
      skills: rest.skills,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  return error;
}
