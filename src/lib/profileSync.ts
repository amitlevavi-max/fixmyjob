/**
 * Profile sync — saves user-entered data to Supabase the moment it changes,
 * and restores it on sign-in / app start.
 *
 * Store actions call `queueProfileSave` (debounced ~0.6 s so tapping a +/−
 * stepper doesn't fire a write per tap). Nothing is sent when signed out.
 */

import { supabase } from './supabase';

type Row = Record<string, unknown>;

let pending: Row = {};
let timer: ReturnType<typeof setTimeout> | null = null;

/** Drop unsent changes — called when the signed-in person changes, so one
 *  user's edits can never be written to another user's profile. */
export function discardPendingProfileSave() {
  if (timer) { clearTimeout(timer); timer = null; }
  pending = {};
}

export function queueProfileSave(fields: Row, immediate = false) {
  Object.assign(pending, fields);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushProfileSave, immediate ? 0 : 600);
}

export async function flushProfileSave() {
  if (timer) { clearTimeout(timer); timer = null; }
  const fields = pending;
  pending = {};
  if (!Object.keys(fields).length) return;

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;   // signed out — nothing to save to

  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) {
    // Most likely cause: the profile-columns migration hasn't been applied
    console.warn('[profileSync] save failed:', error.message);
    // Put the fields back so the next change retries them
    pending = { ...fields, ...pending };
  }
}

/** Load the signed-in user's saved profile row (or null). */
export async function loadProfileRow(userId: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[profileSync] load failed:', error.message);
    return null;
  }
  return data ?? null;
}

/** Save per-opportunity details (rating, reason, dates, steps done) on their own (new column). */
export async function savePlanMeta(meta: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, opportunity_meta: meta, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] plan details not saved:', error.message);
}

/** Save the user's ZIP point on its own (new columns — a missing migration can't block other fields). */
export async function saveHome(home: { zip: string; lat: number; lon: number; city: string; state: string } | null) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase.from('user_profiles').upsert({
    id: userId,
    home_zip: home?.zip ?? null, home_lat: home?.lat ?? null, home_lon: home?.lon ?? null,
    home_city: home ? `${home.city}, ${home.state}` : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] ZIP not saved:', error.message);
}

/** Save how far the user will drive to a course, on its own (new column — a missing migration can't block other fields). */
export async function saveCourseMaxMiles(miles: number) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase.from('user_profiles').upsert({
    id: userId, course_max_miles: miles, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] course distance not saved:', error.message);
}

/**
 * Save the user's opportunity plan on its own, so a missing column (migration
 * not pushed yet) can't hold up the other profile fields in the queue.
 */
export async function savePlan(plan: Record<string, string>) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, opportunity_plan: plan, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] plan not saved:', error.message);
}

/** Save the answers about mandatory credentials on their own (column `credentials`, migration 20261020000000). */
export async function saveCredentials(credentials: Record<string, boolean>) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, credentials, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] credentials not saved:', error.message);
}

/** Save the user's health insurance answer on its own (column `health_coverage`, migration 20261106000000). */
export async function saveHealthCoverage(coverage: object | null) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, health_coverage: coverage, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] health insurance answer not saved:', error.message);
}

/**
 * Claim my rights answers — their own table (migration
 * 20261021000000_claim_rights.sql), readable and writable only by the user.
 * Debounced like the profile queue, so a run of taps is one save.
 */
let rightsTimer: ReturnType<typeof setTimeout> | null = null;
let rightsPending: object | null = null;
export function saveRightsAnswers(answers: object) {
  rightsPending = answers;
  if (rightsTimer) clearTimeout(rightsTimer);
  rightsTimer = setTimeout(flushRightsAnswers, 800);
}
async function flushRightsAnswers() {
  rightsTimer = null;
  const answers = rightsPending;
  if (!answers) return;
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('worker_rights_answers')
    .upsert({ user_id: userId, answers, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.warn('[profileSync] rights answers not saved:', error.message);
  else if (rightsPending === answers) rightsPending = null;
}

/** The signed-in user's Claim my rights answers (or null) */
export async function loadRightsAnswers(userId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('worker_rights_answers')
    .select('answers')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) { console.warn('[profileSync] rights answers not loaded:', error.message); return null; }
  return (data?.answers as Record<string, unknown>) ?? null;
}

/** Save the user's union membership answer on its own (column `union_membership`, migration 20261113000000). */
export async function saveUnionMembership(membership: object | null) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_profiles')
    .upsert({ id: userId, union_membership: membership, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.warn('[profileSync] union membership not saved:', error.message);
}
