/**
 * The opportunity catalog is written in English. Screens show a translated
 * copy (same id, same numbers). Copies are cached per language, so the same
 * opportunity is always the same object (lists compare by identity).
 */
import { t, useLangStore } from '../i18n';
import type { Opportunity } from '../data/opportunityCatalog';

const cache: Record<string, WeakMap<Opportunity, Opportunity>> = {};

export function localizeOpportunity<T extends Opportunity>(o: T): T {
  const lang = useLangStore.getState().lang;
  if (lang === 'en') return o;
  const map = (cache[lang] ??= new WeakMap());
  let out = map.get(o) as T | undefined;
  if (!out) {
    out = {
      ...o,
      title: t(o.title),
      goalTitles: o.goalTitles
        ? Object.fromEntries(Object.entries(o.goalTitles).map(([g, s]) => [g, t(s as string)]))
        : undefined,
      note: t(o.note),
      timeline: t(o.timeline),
      steps: o.steps.map((s) => ({ ...s, title: t(s.title), detail: t(s.detail) })),
    };
    map.set(o, out);
  }
  return out;
}
