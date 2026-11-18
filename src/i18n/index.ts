/**
 * English / Spanish.
 *
 * Text is written in English in the code and wrapped in t(): t('Next →').
 * The Spanish dictionary (src/i18n/es/) maps the English text to Spanish;
 * anything missing simply shows in English. Placeholders in braces are
 * filled in: t('Hi {name}', { name }).
 *
 * Which language:
 *  1. the choice saved on this phone (saved when the user signs in, and when
 *     they change it in Profile → Preferences)
 *  2. otherwise the phone's language: any Spanish or Portuguese → Spanish,
 *     anything else → English.
 * The Welcome screen has an English / Español switch for before sign-in.
 *
 * Components use the useT() hook so they re-render when the language changes.
 * Plain functions outside components can call t() (reads the current language).
 */
import { useCallback } from 'react';
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';
import ES from './es';

export type Lang = 'en' | 'es';
export const LANGUAGES: Array<{ id: Lang; label: string; short: string }> = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'es', label: 'Español', short: 'ES' },
];

const STORE_KEY = 'fixmyjob_language';

/** The phone's language: Spanish or Portuguese → Spanish, else English */
export function deviceLanguage(): Lang {
  let code = '';
  try {
    // expo-localization (needs a rebuild of the app after installing)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loc = require('expo-localization');
    code = loc.getLocales?.()[0]?.languageCode ?? '';
  } catch { /* not in this build */ }
  if (!code) {
    try { code = Intl.DateTimeFormat().resolvedOptions().locale ?? ''; } catch { /* no Intl */ }
  }
  code = code.toLowerCase();
  return code.startsWith('es') || code.startsWith('pt') ? 'es' : 'en';
}

interface LangState {
  lang: Lang;
  /** True once the saved choice has been read at start-up */
  ready: boolean;
  setLang: (l: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: deviceLanguage(),
  ready: false,
  setLang: (lang) => set({ lang }),
}));

/** Read the saved choice (call once at start-up, before showing screens) */
export async function loadSavedLanguage() {
  try {
    const saved = await SecureStore.getItemAsync(STORE_KEY);
    if (saved === 'en' || saved === 'es') useLangStore.setState({ lang: saved });
  } catch { /* keep the phone's language */ }
  useLangStore.setState({ ready: true });
}

/**
 * Remember the current language on this phone, and in the user's profile when
 * signed in (separate write, so a missing column never blocks other saves).
 */
export async function rememberLanguage(userId?: string | null) {
  const lang = useLangStore.getState().lang;
  try { await SecureStore.setItemAsync(STORE_KEY, lang); } catch { /* ignore */ }
  if (userId) {
    supabase.from('user_profiles').upsert({ id: userId, language: lang }, { onConflict: 'id' })
      .then(() => {}, () => {});
  }
}

/** Change the language and remember it (Profile → Preferences) */
export async function changeLanguage(lang: Lang, userId?: string | null) {
  useLangStore.setState({ lang });
  await rememberLanguage(userId);
}

type Params = Record<string, string | number | null | undefined>;

function fill(text: string, params?: Params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (params[k] != null ? String(params[k]) : m));
}

/** Translate English text into the current language */
export function t(text: string, params?: Params): string {
  const lang = useLangStore.getState().lang;
  return fill(lang === 'es' ? ES[text] ?? text : text, params);
}

/** For components: the current language's t(), re-rendering on change */
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return useCallback(
    (text: string, params?: Params) => fill(lang === 'es' ? ES[text] ?? text : text, params),
    [lang],
  );
}

export const useLang = () => useLangStore((s) => s.lang);

/** a / an for English; Spanish sentences are written without it */
export const isSpanish = () => useLangStore.getState().lang === 'es';

/**
 * Source lines ("US Bureau of Labor Statistics, 2025 · Texas", see
 * data/sourceLabels.ts): agency names and the ordinary words are translated.
 */
export function tSource(text: string): string {
  if (useLangStore.getState().lang !== 'es' || !text) return text;
  const MONTHS: Record<string, string> = {
    January: 'enero', February: 'febrero', March: 'marzo', April: 'abril', May: 'mayo', June: 'junio',
    July: 'julio', August: 'agosto', September: 'septiembre', October: 'octubre', November: 'noviembre', December: 'diciembre',
  };
  return text
    .replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/g, (_m, mo, y) => `${MONTHS[mo]} de ${y}`)
    .replace(/Fix My Job estimate, based on (.+?) data\b/g, (_m, from) => `Estimación de Fix My Job, basada en datos de ${from.replace(/ and /g, ' y ')}`)
    .replace(/\bUS Bureau of Labor Statistics\b/g, 'Oficina de Estadísticas Laborales de EE. UU.')
    .replace(/\bUS Census Bureau\b/g, 'Oficina del Censo de EE. UU.')
    .replace(/\bUS Bureau of Economic Analysis\b/g, 'Oficina de Análisis Económico de EE. UU.')
    .replace(/\bUS Agency for Healthcare Research (?:and|y) Quality\b/g, 'Agencia para la Investigación y la Calidad de la Atención Médica de EE. UU.')
    .replace(/\bUS Dept\. of Education\b/g, 'Depto. de Educación de EE. UU.')
    .replace(/\(built-in\)/g, '(incluido en la app)')
    .replace(/, (\d{4}) data\b/g, ', datos de $1')
    .replace(/\bU\.S\. Dept\. of Labor\b|\bUS Dept\. of Labor\b/g, 'Depto. de Trabajo de EE. UU.')
    .replace(/\bU\.S\. Census Bureau\b/g, 'Oficina del Censo de EE. UU.')
    .replace(/\bCurrent Population Survey\b/g, 'Encuesta de Población Actual (CPS)')
    .replace(/ metro wages\b/g, ': salarios por área metropolitana')
    .replace(/\bRegional Price Parities\b/g, 'Paridades de Precios Regionales')
    .replace(/· US$/g, '· EE. UU.')
    .replace(/\bstate minimum wage table\b/g, 'tabla de salarios mínimos estatales')
    .replace(/\bapproved training programs\b/g, 'programas de capacitación aprobados')
    .replace(/\bexperience needed to be hired\b/g, 'experiencia necesaria para ser contratado');
}
