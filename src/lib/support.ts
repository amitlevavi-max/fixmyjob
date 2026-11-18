/**
 * Support requests — saved to the `support_requests` table
 * (migration 20261011010000_support_requests.sql). Insert-only from the app.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type SupportCategory = 'incorrect_data' | 'bug' | 'information' | 'other';

export const SUPPORT_CATEGORIES: { id: SupportCategory; label: string; icon: string }[] = [
  { id: 'incorrect_data', label: 'Incorrect data', icon: 'f:alert-triangle' },
  { id: 'bug', label: "Something isn't working", icon: 'f:tool' },
  { id: 'information', label: 'Request for information', icon: 'f:help-circle' },
  { id: 'other', label: 'Something else', icon: 'f:message-circle' },
];

export async function sendSupportRequest(input: {
  userId: string | null;
  email: string | null;
  category: SupportCategory;
  message: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from('support_requests').insert({
    user_id: input.userId,
    email: input.email?.trim() || null,
    category: input.category,
    message: input.message.trim(),
    app_version: Constants.expoConfig?.version ?? null,
    platform: `${Platform.OS} ${Platform.Version}`,
  });
  if (error) {
    const msg = /too many/i.test(error.message)
      ? 'You have sent a lot of requests in the last hour. Please try again later.'
      : 'We could not send your message. Please check your internet connection and try again.';
    return { ok: false, error: msg };
  }
  return { ok: true };
}
