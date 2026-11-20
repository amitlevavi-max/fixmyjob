/**
 * Analytics: the ONE place the app sends usage events from.
 * Every screen calls track() / trackScreen() here, never PostHog directly, so
 * the tool can be swapped by changing this file only.
 *
 * Event list and meaning: claude/analytics-events.md (project docs).
 *
 * Sent automatically by PostHog: "Application Opened", "Application Became Active",
 * "Application Backgrounded", "Application Installed", "Application Updated".
 * Every event also carries:
 *   screen — the screen the user is on (onboarding sub-steps included, e.g. "ManualEntry:pay")
 *   lang   — app language (en / es)
 *   env    — dev (emulator / dev build) or prod (store build) — filter dev out in reports
 *
 * Privacy: never send email, name, password or pay amounts. No hardware ids
 * either: PostHog's own visitor id is a random number made on the phone (not
 * the Android ID, advertising ID or MAC address), and the signed-in user is
 * sent only as a keyed hash of their Supabase id (hashUserId) — useless to
 * anyone who gets PostHog's data without our key and database.
 * PostHog project setting to keep on: "Discard client IP data".
 */
import PostHog from 'posthog-react-native';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { ANALYTICS } from '../config/analytics';
import type { Opportunity } from '../data/opportunityCatalog';
import type { Goal } from '../store/userStore';
import { useLangStore } from '../i18n';

export type AnalyticsEvent =
  | 'language_changed'          // { from, to }
  | 'get_started_click'         // Welcome → create account
  | 'google_signin_click'       // Welcome → Continue with Google
  | 'signin_link_click'         // Welcome / Sign up → "Sign in" link
  | 'signin_submit'             // Sign in screen → Sign in button (email + password)
  | 'create_account_click'      // Sign up screen → Create account button
  | 'login_succeeded'           // { method: google | email }
  | 'login_failed'              // { method, reason }
  | 'account_created'           // { method: email }
  | 'signup_failed'             // { reason }
  | 'goal_selected'             // { goal }
  | 'continue_click'            // { step } — Continue / Next on an onboarding screen
  | 'satisfaction_selected'     // { value 1–5, goal }
  | 'job_category_selected'     // { category } — predefined work chip
  | 'job_title_entered'         // { title } — free text, sent when the user continues
  | 'occupation_selected'       // { soc, title } — "Which job is closest?" list; soc "none" = not listed
  | 'certification_marked'      // { name, answer: have | not_yet }
  | 'skip_click'                // { step }
  | 'back_click'                // { step }
  | 'tenure_selected'           // { range }
  | 'pay_adjusted'              // { method: slider | stepper, direction: up | down }
  | 'see_where_i_stand_click'
  // Suggestions (My plan · Where I stand · All suggestions → suggestion screen)
  | 'suggestion_opened'         // suggestion screen opened
  | 'suggestion_added'          // "Add to my plan" — { from: suggestion | standing }
  | 'suggestion_declined'       // "Not for me" — { reason } if given
  | 'suggestion_already_have'   // "I already have this" (certifications / licenses)
  | 'suggestion_rated'          // 👎 😐 👍 — { rating: not | somewhat | very }
  // Main app
  | 'tab_click'                 // bottom tab — { tab: where_i_stand | my_plan | profile }
  | 'profile_edit_click';       // a Profile row — { section, field, action: edit | add }
// Every suggestion_* event carries suggestionProps(): suggestion_type, suggestion_id, suggestion_title, goal

type Props = Record<string, string | number | boolean | null | undefined>;

let client: PostHog | null = null;
let currentScreen: string | null = null;
let currentUser: string | null = null;

/** Start analytics once, at app start. No key configured → stays off. */
export function initAnalytics() {
  if (client || !ANALYTICS.POSTHOG_KEY) return;
  try {
    client = new PostHog(ANALYTICS.POSTHOG_KEY, {
      host: ANALYTICS.POSTHOG_HOST,
      captureAppLifecycleEvents: true,
      // Session replay (needs @posthog/react-native-plugin + "Record user sessions" on
      // in PostHog → Settings → Session replay). Privacy: every text, text field and
      // image is blacked out — recordings show layout, screens, taps and scrolling,
      // never names, pay, job titles or what was typed. No logs, no network calls.
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        captureLog: false,
        captureNetworkTelemetry: false,
      },
    });
    const lang = useLangStore.getState().lang;
    void client.register({ env: __DEV__ ? 'dev' : 'prod', lang });
    useLangStore.subscribe((s, prev) => {
      if (s.lang !== prev.lang) void client?.register({ lang: s.lang });
    });
  } catch {
    client = null;   // analytics must never break the app
  }
}

/** Record one user action. */
export function track(event: AnalyticsEvent, props: Props = {}) {
  if (!client) return;
  try {
    client.capture(event, { screen: currentScreen, ...clean(props) });
  } catch { /* ignore */ }
}

/**
 * Record a screen view. Called by the navigator on every screen change, and by
 * screens with several questions in one (ManualEntry) for each question.
 */
export function trackScreen(name: string, props: Props = {}) {
  if (name === currentScreen) return;
  currentScreen = name;
  if (!client) return;
  try {
    void client.screen(name, clean(props));
  } catch { /* ignore */ }
}

/**
 * Link events to the signed-in user (hashed Supabase id), so the journey before
 * sign-in (app open, Welcome, Get started) joins the same person.
 * null = signed out → later events start a new anonymous visitor.
 */
export function identifyUser(userId: string | null) {
  if (userId === currentUser) return;
  const wasSignedIn = currentUser !== null;
  currentUser = userId;
  if (!client) return;
  try {
    if (userId) client.identify(hashUserId(userId));
    else if (wasSignedIn) client.reset();
  } catch { /* ignore */ }
}

/**
 * The id PostHog knows a user by: HMAC-SHA256 of the Supabase user id with
 * ANALYTICS.ID_HASH_KEY (hex). To find one user's journey in PostHog, compute the
 * same in Supabase (SQL editor, pgcrypto):
 *   select encode(extensions.hmac(id::text, '<ID_HASH_KEY>', 'sha256'), 'hex') from auth.users where email = '...';
 */
export function hashUserId(userId: string): string {
  return bytesToHex(hmac(sha256, utf8ToBytes(ANALYTICS.ID_HASH_KEY), utf8ToBytes(userId)));
}

/**
 * Which kind of suggestion it is, for reports. One stable name per kind, from
 * the item's id / data model (ids: lib/rightsCheck, lib/shortCourses,
 * lib/flaggedCerts, data/careerMoves, data/riseOpportunities, data/opportunityCatalog).
 */
export type SuggestionType =
  | 'claim_rights' | 'course' | 'certification' | 'union' | 'health_insurance'
  | 'move_metro' | 'promotion' | 'career_change' | 'next_role' | 'other';

export function suggestionType(o: Pick<Opportunity, 'id' | 'gainModel' | 'courseKeyword'>): SuggestionType {
  const id = o.id;
  if (id.startsWith('right:') || o.gainModel === 'min_wage_gap' || id === 'wage-theft-claim' || id === 'minimum-wage-check') return 'claim_rights';
  if (id === 'union-membership' || o.gainModel === 'union_premium') return 'union';
  if (id === 'health-insurance') return 'health_insurance';
  if (o.gainModel === 'relocation') return 'move_metro';
  if (id.startsWith('move:promotion:')) return 'promotion';
  if (id.startsWith('move:change:')) return 'career_change';
  if (id.startsWith('next-role:')) return 'next_role';
  if (id.startsWith('course:') || id.startsWith('web:') || o.courseKeyword) return 'course';
  if (id.startsWith('cert:') || o.gainModel === 'cert_gap') return 'certification';
  return 'other';
}

/** Properties for every suggestion_* event (title as shown, in the app's language) */
export function suggestionProps(o: Opportunity, goal?: Goal | null): Props {
  return { suggestion_type: suggestionType(o), suggestion_id: o.id, suggestion_title: o.title, goal: goal ?? null };
}

/** "onboarding" or "edit" (the same screens opened from Profile) */
export const modeOf = (editing: boolean) => (editing ? 'edit' : 'onboarding');

function clean(props: Props) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  return out;
}
