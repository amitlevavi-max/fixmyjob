/**
 * "Get certified" items for certifications CareerOneStop flags In-Demand or Industry-Endorsed (Amit, 2026-11-18).
 *
 * Guiding rule (claude/decisions.md): an action is only suggested with its effort and its upside.
 *   effort — the best real course that prepares for the certification (database function
 *            flagged_certifications(): DOL / Credential Engine courses linked to it, cost and length known,
 *            online or within the user's driving distance, past-student results first);
 *   upside — the Census CPS pay difference between certified and uncertified workers in the user's job
 *            (gainModel 'cert_gap', the same figure as the missing-credential items; counted once).
 * A certification without such a course near the user is not suggested.
 *
 * For the user's own job only. Certifications the user said they hold are left out; "I already have this"
 * on the item records it (credentialName). Flagged items rank first in their bucket (lib/planView).
 * Quick win when the course is short (online ≤ 30 hours, or ≤ 6 weeks and 48 hours), otherwise Worth the effort.
 */
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { t } from '../i18n';
import { courseItem, type ShortCourse } from './shortCourses';
import type { Opportunity } from '../data/opportunityCatalog';

export const CERT_PREFIX = 'cert:';

export interface FlaggedCert {
  credential: {
    id: string; name: string; issuer: string | null; url: string | null; source: string;
    cos_cert_id: string | null; in_demand: boolean; industry_endorsed: boolean; cos_checked_at: string | null;
  };
  course: ShortCourse;
  /** Courses near the user (or online) that prepare for it */
  courses_near: number;
}

type Point = { lat: number; lon: number } | null | undefined;

const cache = new Map<string, Promise<FlaggedCert[] | null>>();

export function fetchFlaggedCerts(soc: string, state: string | null, point: Point, maxMiles: number, held: string[]) {
  const key = [soc, state ?? '', point ? `${point.lat.toFixed(2)},${point.lon.toFixed(2)}` : '', maxMiles, [...held].sort().join('|')].join('#');
  if (!cache.has(key)) {
    const p = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data, error } = await supabase.rpc('flagged_certifications', {
            p_soc: soc, p_state: state, p_lat: point?.lat ?? null, p_lon: point?.lon ?? null,
            p_max_miles: maxMiles, p_held: held, p_limit: 3,
          });
          if (!error && Array.isArray(data)) return data as FlaggedCert[];
        } catch { /* try again */ }
      }
      return null;
    })().then((r) => { if (!r) cache.delete(key); return r; });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

/** Flagged certifications for the user's job, each with its best course ([] = none; null while loading) */
export function useFlaggedCerts(soc: string | null, state: string | null, point: Point, maxMiles: number, held: string[]) {
  const key = `${soc}|${state}|${point?.lat},${point?.lon}|${maxMiles}|${[...held].sort().join('|')}`;
  const [res, setRes] = useState<{ key: string; list: FlaggedCert[] | null }>({ key: '', list: null });
  useEffect(() => {
    let alive = true;
    if (!soc) return;
    fetchFlaggedCerts(soc, state, point, maxMiles, held).then((r) => { if (alive) setRes({ key, list: r ?? [] }); });
    return () => { alive = false; };
  }, [key]);
  if (!soc) return [] as FlaggedCert[];
  return res.key === key ? res.list : null;
}

const isQuick = (c: ShortCourse) => {
  const hours = c.total_hours ?? 0;
  return c.format === 'online' ? hours > 0 && hours <= 30 : hours > 0 && hours <= 48 && (c.weeks ?? 1) <= 6;
};

/** One plan item per flagged certification, built on the course item (same steps for signing up) */
export function flaggedCertItem(f: FlaggedCert, ownSoc: string | null,
  user: { state: string | null; stateName: string | null }): Opportunity {
  const c = f.credential;
  const base = courseItem(f.course, ownSoc, {}, user);
  const issuer = c.issuer ?? t('the certifying organization');
  const steps = base.steps.map((s) =>
    s.title === t('Finish the course and keep your certificate')
      ? {
          title: t('Pass the {cert} exam', { cert: c.name }),
          detail: t('The course prepares you for it. {issuer} issues the certification — their page explains how to sign up for the exam.', { issuer }),
          ...(c.url ? { url: c.url } : {}),
        }
      : s);
  const more = f.courses_near > 1 ? ` ${t('{n} courses near you or online prepare for it. Courses with past-student results and a lower cost come first.', { n: f.courses_near })}` : '';
  return {
    ...base,
    id: `${CERT_PREFIX}${c.id}`,
    credentialName: c.name,
    title: t('Get certified: {cert}', { cert: c.name }),
    gain: t('Checking what certified workers in your job earn…'),
    gainAmount: 0,                         // computed per user — gainModel
    gainModel: 'cert_gap',
    kind: 'add_on',
    countGroup: 'own-cert',                // same pay difference as the missing-credential items: counted once
    source: undefined,
    note: `${t('{issuer} issues this certification. The course below prepares you for it.', { issuer })}${more}`,
    goalAlignment: ['earn_more', 'rise_up'],
    effort: isQuick(f.course) ? 'quick' : 'effort',
    cosFlags: { inDemand: c.in_demand, endorsed: c.industry_endorsed, checkedAt: c.cos_checked_at, credential: c.name },
    steps,
  };
}
