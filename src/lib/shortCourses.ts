/**
 * Short courses = certification Quick wins (Amit, 2026-10-26).
 *
 * Every user should have a Quick win that is an active step to improve
 * themselves, not only a rights claim. A certification counts as a Quick win
 * when there is a real, approved course (DOL training-program list) that is
 *   - online and under 30 hours in total, or
 *   - in person / hybrid within 10 miles (or as far as the user will drive,
 *     up to 100 — asked when nothing was found), at most 6 weeks and 48 hours.
 * The database function short_courses() applies these rules (see migration
 * 20261026010000_short_courses.sql); this file turns the best one into a plan item.
 *
 * Courses are looked for in the user's own job (except the training that gets
 * people INTO that job) and in the jobs of their suggested promotions and
 * career changes.
 *
 * When the DOL list has no valid course for the user, an AI web search looks
 * for one with the same rules (Edge Function suggest-course; Amit, 2026-10-26).
 *
 * When neither finds a course, the plan gets a stand-in item "Find a short
 * course near you" (courseSearchItem; Amit, 2026-10-27): it says nothing was
 * found within the distance and asks for the ZIP code and how far the user
 * will drive (components/WidenCourseSearch). Either answer is saved to the
 * profile and the search runs again.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { t } from '../i18n';
import { SRC } from '../data/sourceLabels';
import { STATES } from '../data/locationData';
import type { Opportunity } from '../data/opportunityCatalog';
import type { Goal } from '../store/userStore';

export const COURSE_PREFIX = 'course:';

export interface ShortCourse {
  id: string;
  provider: string;
  name: string;
  credential: string | null;
  for_soc: string;
  state: string | null;
  city: string | null;
  format: string | null;
  url: string | null;
  tuition: number | null;
  weeks: number | null;
  total_hours: number;
  distance_mi: number | null;
  supplies?: number | null;
  address?: string | null;
  description?: string | null;
  exited?: number | null;
  completion_rate?: number | null;
  employed_q2_rate?: number | null;
  employed_q4_rate?: number | null;
  median_q2_earnings?: number | null;   // quarterly
  credential_rate?: number | null;
  reported_at?: string | null;
  /** Where the row comes from: DOL approved-training list (default) or the Credential Engine registry */
  source?: 'dol' | 'credential_engine';
  /** Credential Finder page — on Credential Engine courses, and on DOL courses Credential Engine also lists */
  ce_finder_url?: string | null;
  /** "Last updated" on Credential Engine */
  ce_updated_at?: string | null;
  /** Licenses / certifications the course prepares for (Credential Engine registry, matched by name) */
  leads_to?: Array<{ name: string; issuer: string; kind: string; finder_url: string | null;
    /** CareerOneStop flags of that credential (lib/cosFlags) */
    in_demand?: boolean; industry_endorsed?: boolean; cos_checked_at?: string | null }> | null;
  /** Set when the course was found by the web search, not on the DOL list */
  web?: WebCourse & { foundAt: string };
}

/** A course found by the AI web search (suggest-course) — every value comes from a page that was checked */
export interface WebCourse {
  name: string;
  provider: string;
  format: 'online' | 'in_person' | 'hybrid';
  location: string | null;
  duration: string | null;      // as written on the page
  hours: number | null;
  price: string | null;         // as written on the page
  price_source: string | null;
  credential: string | null;
  why: string | null;
  url: string;
  phone: string | null;
  email: string | null;
  sources: { price?: string; phone?: string; email?: string };
}

export interface WebCourseRequest {
  job: string; soc: string | null; goals: string[]; pay: number | null; monthsInJob: number | null;
  credentialsHeld: string[];
  location: { city: string | null; state: string | null; stateName: string | null; zip: string | null };
  nextJobs: Array<{ soc: string; title: string; kind: string }>;
  /** How far the user will drive to an in-person class (10–100) */
  maxMiles: number;
}

const webCache = new Map<string, Promise<{ courses: WebCourse[]; searchedAt: string } | null>>();

/** Web-search courses for this user (null while unknown or on failure; tried twice) */
export function fetchWebCourses(r: WebCourseRequest) {
  const key = JSON.stringify([r.soc ?? r.job, r.location.state, r.location.zip ?? r.location.city, r.nextJobs.map((x) => x.soc).sort(), r.maxMiles]);
  if (!webCache.has(key)) {
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.functions.invoke('suggest-course', { body: r });
          if (!error && Array.isArray(data?.courses)) return { courses: data.courses as WebCourse[], searchedAt: String(data.searchedAt) };
        } catch { /* try again */ }
      }
      return null;
    })().then((x) => { if (!x) webCache.delete(key); return x; });
    webCache.set(key, p);
  }
  return webCache.get(key)!;
}

/**
 * Runs the web search only when `enabled` (the DOL list came back with nothing valid).
 * null while searching; a search that failed twice counts as "nothing found"
 * (the stand-in item then shows, and the next search tries again).
 */
export function useWebCourses(r: WebCourseRequest | null, enabled: boolean) {
  const key = r && enabled ? JSON.stringify(r) : '';
  const [res, setRes] = useState<{ courses: WebCourse[]; searchedAt: string } | null>(null);
  useEffect(() => {
    let alive = true;
    setRes(null);
    if (!r || !enabled) return;
    fetchWebCourses(r).then((x) => { if (alive) setRes(x ?? { courses: [], searchedAt: new Date().toISOString() }); });
    return () => { alive = false; };
  }, [key]);
  return res;
}

type Point = { lat: number; lon: number } | null | undefined;

const cache = new Map<string, Promise<ShortCourse[] | null>>();

/** One call; a failed call (e.g. a database timeout on a cold start) is tried again right away, up to 3 tries */
async function callShortCourses(args: Record<string, unknown>): Promise<ShortCourse[] | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await supabase.rpc('short_courses', args);
      if (!error && Array.isArray(data)) return data as ShortCourse[];
    } catch { /* try again */ }
  }
  return null;
}

export function fetchShortCourses(socs: string[], ownSoc: string | null, state: string | null, point: Point, promoSocs: string[] = [], maxMiles = 10) {
  const key = [socs.join(','), ownSoc ?? '', state ?? '', point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : '', promoSocs.join(','), maxMiles].join('|');
  if (!cache.has(key)) {
    const p = callShortCourses({
      p_socs: socs, p_own_soc: ownSoc, p_state: state,
      p_lat: point?.lat ?? null, p_lon: point?.lon ?? null, p_limit: 5,
      // own job first, then these (promotions); other jobs (career changes) only when those give nothing
      p_promo_socs: promoSocs,
      // how far the user will drive (10 unless they chose more); sent only when changed, so the
      // app keeps working with the older database function until the migration is pushed
      ...(maxMiles !== 10 ? { p_max_miles: maxMiles } : {}),
    }).then((r) => { if (!r) cache.delete(key); return r; });   // still failing → asked again next time the list is built
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** Up to 5 short courses, best first (null while loading or unavailable) */
export function useShortCourses(socs: string[], ownSoc: string | null, state: string | null, point: Point, promoSocs: string[] = [], maxMiles = 10) {
  const key = `${socs.join(',')}|${ownSoc}|${state}|${point?.lat},${point?.lon}|${promoSocs.join(',')}|${maxMiles}`;
  // The list is kept with the request it answers, so an answer for an older request (e.g. before
  // the next jobs loaded) is never shown as the answer for the new one (Amit 2026-10-28: it started paid web searches)
  const [res, setRes] = useState<{ key: string; list: ShortCourse[] | null }>({ key: '', list: null });
  useEffect(() => {
    let alive = true;
    if (!socs.length) return;
    fetchShortCourses(socs, ownSoc, state, point, promoSocs, maxMiles).then((r) => { if (alive) setRes({ key, list: r }); });
    return () => { alive = false; };
  }, [key]);
  return res.key === key ? res.list : null;
}

/** "Mental Health Technician - Certification (10002161 Fort Wayne)" → "Mental Health Technician - Certification" */
/** Provider codes ("(10002161 Fort Wayne)", "(3211 Louisville)", "1138292-…") out; a "?" inside a word was an apostrophe ("Inspector?s") */
const stripCodes = (s: string) => s.replace(/\s*\(\s*\d{3,}[^)]*\)\s*/g, ' ').replace(/^\d{5,}\s*-\s*/, '')
  .replace(/([A-Za-z])\?([A-Za-z])/g, "$1'$2").replace(/\s+/g, ' ').trim();
/** ALL-CAPS names ("CARDIOVASCULAR TECH") in normal case ("Cardiovascular Tech"); short words like CNA, EKG stay as they are */
const SMALL = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const unshout = (s: string) => (s !== s.toUpperCase() || !/[A-Z]{4}/.test(s) ? s
  : s.split(' ').map((w, i) => (w.length <= 3 && !SMALL.has(w.toLowerCase()) ? w
    : i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase()
    : w.charAt(0) + w.slice(1).toLowerCase())).join(' '));
const cleanName = (s: string) => unshout(stripCodes(s));

/**
 * One plan item per course.
 * targets: SOC → { title of the job, kind of move } for courses toward another job.
 */
export function courseItem(c: ShortCourse, ownSoc: string | null,
  targets: Record<string, { title: string; move: 'promotion' | 'career_change' }>,
  /** Where the user works (null = not given yet) */
  user: { state: string | null; stateName: string | null } = { state: null, stateName: null }): Opportunity {
  const name = cleanName(c.name);
  const hours = Math.round(c.total_hours);
  const online = c.format === 'online';
  const where = online
    ? t('online')
    : t('{miles} miles away in {city}', { miles: Math.max(1, Math.round(c.distance_mi ?? 0)), city: c.city ?? '' });
  const target = c.for_soc !== ownSoc ? targets[c.for_soc] : undefined;
  const toward = target ? t('A first step toward the {job} job.', { job: target.title }) : t('A certificate in the job you do now.');
  // Credential Engine courses are published by the provider, not approved by the Dept. of Labor (2026-11-12)
  const ce = c.source === 'credential_engine';
  const knownWeeks = c.weeks != null && c.weeks > 1;
  const goals: Goal[] = target?.move === 'career_change' ? ['rise_up', 'earn_more', 'change_careers'] : ['rise_up', 'earn_more'];
  return {
    id: `${COURSE_PREFIX}${c.id}`,
    title: t('Take a short course: {name}', { name }),
    gain: t('About {hours} hours, {where} · {provider}', { hours, where, provider: c.provider }),
    gainAmount: 0,                       // no sourced pay figure for a single course
    source: ce ? SRC.CE : SRC.DOL,       // translated where it is shown (tSource)
    note: `${toward} ${ce
      ? t('The course is listed on the Credential Engine registry by the school or training provider.')
      : t('The course is on the US Department of Labor list of approved training programs.')}`,
    kind: 'add_on',
    jobFamily: 'All',
    goalAlignment: goals,
    effort: 'quick',
    course: c,                           // shown in full on the item screen (components/CourseDetails)
    effortHours: hours,
    timeline: t('About {hours} hours', { hours }),
    physicalDemand: 'low',
    steps: [
      // A course approved in another state may lead to a certificate that isn't
      // accepted where the user works (Amit, 2026-10-26): ask before paying
      ...(!user.state || c.state !== user.state ? [{
        title: user.stateName
          ? t('Check that the certificate is accepted in {state}', { state: user.stateName })
          : t('Check that the certificate is accepted in your state'),
        detail: t(ce
          ? 'This course is offered in {courseState}. Before you sign up or pay, call or email {provider} and ask: "Is this certificate recognized by employers and by the state licensing or certification board in {state}?" Some certificates are only valid in one state.'
          : 'This course is approved in {courseState}. Before you sign up or pay, call or email {provider} and ask: "Is this certificate recognized by employers and by the state licensing or certification board in {state}?" Some certificates are only valid in the state that approved the course.', {
          courseState: STATES.find((x) => x.abbr === c.state)?.name ?? c.state ?? t('another state'), provider: c.provider, state: user.stateName ?? t('my state'),
        }),
        ...(c.url ? { url: c.url } : {}),
      }] : []),
      {
        title: t('Sign up with {provider}', { provider: c.provider }),
        detail: [
          online ? t('Online course, about {hours} hours in total.', { hours })
            : ce && !knownWeeks ? t('In {city}, about {hours} hours.', { city: c.city ?? '', hours })
            : t('In {city}, about {hours} hours over {weeks} weeks.', { city: c.city ?? '', hours, weeks: Math.max(1, Math.round(c.weeks ?? 1)) }),
          c.tuition ? t('Listed cost: {cost}.', { cost: `$${Math.round(c.tuition).toLocaleString()}` }) : null,
          c.credential ? t('You get: {credential}.', { credential: c.credential }) : null,
          c.leads_to?.length ? t('Prepares you for: {credentials}.', { credentials: c.leads_to.map((x) => x.name).join(', ') }) : null,
        ].filter(Boolean).join(' '),
        ...(c.url ? { url: c.url } : {}),
      },
      { title: t('Finish the course and keep your certificate'), detail: t('Save a copy of the certificate on your phone.') },
      { title: t('Tell your manager and add it to your resume'), detail: t('New skills count when you ask for a raise or apply for a better job.') },
    ],
  };
}

const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Plan item for a course found by the web search (same shape as courseItem, no DOL figures) */
export function webCourseItem(w: WebCourse, foundAt: string,
  user: { state: string | null; stateName: string | null } = { state: null, stateName: null }): Opportunity {
  const name = cleanName(w.name);
  const online = w.format === 'online';
  const length = w.duration ?? (w.hours ? t('About {hours} hours', { hours: Math.round(w.hours) }) : null);
  const where = online ? t('online') : w.location ?? '';
  const course: ShortCourse = {
    id: `web:${slug(`${w.provider} ${w.name}`)}`,
    provider: w.provider, name, credential: w.credential, for_soc: '', state: null, city: online ? null : w.location,
    format: w.format, url: w.url, tuition: null, weeks: null, total_hours: w.hours ?? 0, distance_mi: null,
    web: { ...w, foundAt },
  };
  return {
    id: `${COURSE_PREFIX}${course.id}`,
    title: t('Take a short course: {name}', { name }),
    gain: [length, where, w.provider].filter(Boolean).join(' · '),
    gainAmount: 0,
    source: t('Found by web search on {date}', { date: new Date(foundAt).toLocaleDateString() }),
    note: `${w.why ?? ''} ${t('This course is not on the US Department of Labor list of approved training programs — it was found by a web search.')}`.trim(),
    kind: 'add_on',
    jobFamily: 'All',
    goalAlignment: ['rise_up', 'earn_more'],
    effort: 'quick',
    course,
    effortHours: w.hours ?? 10,
    timeline: length ?? t('A few hours'),
    physicalDemand: 'low',
    steps: [
      {
        title: t('Check the details with {provider}', { provider: w.provider }),
        detail: t('Before you sign up or pay, call or email them and confirm the price, the dates, and that the certificate is recognized by employers in {state}.', { state: user.stateName ?? t('your state') }),
        url: w.url,
      },
      {
        title: t('Sign up with {provider}', { provider: w.provider }),
        detail: [
          length ? (online ? t('Online course: {length}.', { length }) : t('In {place}: {length}.', { place: w.location ?? '', length })) : null,
          w.price ? t('Listed price: {price}.', { price: w.price }) : null,
          w.credential ? t('You get: {credential}.', { credential: w.credential }) : null,
        ].filter(Boolean).join(' ') || t('See the course page for dates and price.'),
        url: w.url,
      },
      { title: t('Finish the course and keep your certificate'), detail: t('Save a copy of the certificate on your phone.') },
      { title: t('Tell your manager and add it to your resume'), detail: t('New skills count when you ask for a raise or apply for a better job.') },
    ],
  };
}

/** Id of the stand-in item shown when no short course was found */
export const COURSE_SEARCH_ID = `${COURSE_PREFIX}none`;

/**
 * Stand-in Quick win when no short course was found (Amit, 2026-10-27).
 * Its screen (NextSteps) shows components/WidenCourseSearch: ZIP code and
 * driving distance. Once a course is found, this item is replaced by it.
 */
export function courseSearchItem(maxMiles: number, place: string | null): Opportunity {
  return {
    id: COURSE_SEARCH_ID,
    title: t('Find a short course near you'),
    gain: t('No course found within {miles} miles yet', { miles: maxMiles }),
    gainAmount: 0,
    note: place
      ? t('We could not find a short course within {miles} miles of {place}. Tell us a bit more and we will look again.', { miles: maxMiles, place })
      : t('We could not find a short course within {miles} miles of you. Tell us a bit more and we will look again.', { miles: maxMiles }),
    kind: 'add_on',
    jobFamily: 'All',
    goalAlignment: ['rise_up', 'earn_more'],
    effort: 'quick',
    courseSearch: true,
    timeline: t('A few hours'),
    physicalDemand: 'low',
    steps: [
      { title: t('Tell us your ZIP code'), detail: t('So we measure the distance from where you live, not from the middle of your city or state.') },
      { title: t('Tell us how far you would drive'), detail: t('Anywhere from 10 to 100 miles. We will look again right away.') },
    ],
  };
}
