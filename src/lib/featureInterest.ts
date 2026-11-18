/**
 * Demand test for features that aren't built yet (Amit, 2026-10-21): the
 * button is shown, a tap says "Coming soon", and one row is logged to
 * `feature_interest` (migration 20261021000000_claim_rights.sql). Insert-only
 * from the app; read the counts in the Supabase SQL editor:
 *   select * from feature_interest_summary;
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type Feature = 'pay_stub_reading' | 'talk_to_lawyer' | 'job_offers';   // job_offers: migration 20261027000000

export async function logFeatureInterest(feature: Feature, screen: string, context?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const { error } = await supabase.from('feature_interest').insert({
    user_id: session?.user?.id ?? null,
    feature,
    screen,
    context: context ?? null,
    platform: Platform.OS,
  });
  if (error) console.warn('[featureInterest] not logged:', error.message);
}
