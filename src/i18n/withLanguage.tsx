import React from 'react';
import { useLangStore } from './index';

/**
 * Re-render a whole screen when the language changes (screens and their
 * components call t() while rendering). `key` remounts nothing — the screen
 * keeps its state; it just draws again in the new language.
 */
export function withLanguage<P extends object>(Screen: React.ComponentType<P>) {
  function LanguageAware(props: P) {
    useLangStore((s) => s.lang);
    return <Screen {...props} />;
  }
  LanguageAware.displayName = `withLanguage(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
  return LanguageAware;
}

const cache = new Map<React.ComponentType<any>, React.ComponentType<any>>();

/** withLanguage, created once per screen (safe to call inside render) */
export function lw<P extends object>(Screen: React.ComponentType<P>): React.ComponentType<P> {
  let w = cache.get(Screen);
  if (!w) { w = withLanguage(Screen); cache.set(Screen, w); }
  return w as React.ComponentType<P>;
}
