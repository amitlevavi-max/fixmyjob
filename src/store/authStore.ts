import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  clearError: () => void;
}

/**
 * Plain-language versions of Supabase Auth errors. Supabase says "User
 * already registered" when the EMAIL is taken — usernames aren't checked
 * for uniqueness at all — so say that clearly.
 */
function friendlyAuthError(err: any, fallback: string): string {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '');
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already exists/i.test(msg)) {
    return 'An account with this email already exists. Sign in instead, or use a different email.';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Wrong email or password.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Please confirm your email first — check your inbox for the link.';
  }
  if (code === 'weak_password' || /password should/i.test(msg)) {
    return 'That password is too weak. Use at least 8 characters, mixing letters and numbers.';
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) {
    return 'That email address doesn\'t look right. Please check it.';
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || /rate limit/i.test(msg)) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (/network|fetch/i.test(msg)) return 'No connection. Check your internet and try again.';
  return msg || fallback;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: false,
  error: null,

  signUp: async (email, password, username) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw error;
      // With email confirmation on, Supabase hides taken emails: no error, but no identities
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw { code: 'user_already_exists' };
      }
      set({ session: data.session, user: data.user });
    } catch (err: any) {
      set({ error: friendlyAuthError(err, 'Sign up failed. Please try again.') });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      set({ session: data.session, user: data.user });
      return true;
    } catch (err: any) {
      set({ error: friendlyAuthError(err, 'Sign in failed. Check your email and password.') });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, error: null });
  },

  setSession: (session) => {
    set({ session, user: session?.user ?? null });
  },

  clearError: () => set({ error: null }),
}));
