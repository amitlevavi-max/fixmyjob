// ─────────────────────────────────────────────────────────────────────────────
// Fix My Job — "Workwear" design system (Oct 2026 refresh)
//
// Deep denim ground with a soft safety-orange glow, Barlow Condensed uppercase
// display type (italic for hero headlines), safety-orange accents, thin line
// work. Deliberately trade-neutral: it should feel right for nurses, drivers,
// warehouse, factory and field workers alike — no construction-only motifs.
// Every screen should build from these tokens and the shared components in
// src/components — avoid hard-coding colours or fonts inside screens.
// ─────────────────────────────────────────────────────────────────────────────

export const Colors = {
  // ── Brand ──────────────────────────────────────────────────────────────────
  accent: '#F26419',        // Safety orange — primary CTAs, key numbers, highlights
  accentHi: '#FF8547',      // Hi-vis orange — accent text on dark
  accentSoft: 'rgba(242,100,25,0.14)',
  accentLine: 'rgba(242,100,25,0.55)',
  primary: '#2B5CE6',       // Indigo blue — secondary interactive
  primaryOnDark: '#5B82EE', // Faded blue — links / info on dark
  positive: '#22C55E',      // Trade green — gains, success
  positiveSoft: 'rgba(34,197,94,0.14)',

  // ── Denim grounds (darkest → lightest) ─────────────────────────────────────
  ink: '#0A1628',           // Midnight — deepest background
  denimDark: '#112040',     // Deep denim — hero / screen ground
  denimMid: '#1B3268',      // Denim — sheets, raised surfaces
  denimWash: '#24438A',     // Mid wash — active surfaces

  // ── Surfaces ───────────────────────────────────────────────────────────────
  card: 'rgba(10,22,40,0.62)',          // blueprint panel
  cardRaised: 'rgba(27,50,104,0.55)',   // lighter panel
  field: 'rgba(10,22,40,0.70)',         // text inputs

  // ── Line work (blueprint strokes) ──────────────────────────────────────────
  line: 'rgba(147,174,221,0.22)',
  lineStrong: 'rgba(147,174,221,0.42)',
  grid: 'rgba(147,174,221,0.07)',
  gridMajor: 'rgba(147,174,221,0.13)',

  // ── Text ───────────────────────────────────────────────────────────────────
  text: '#FFFFFF',
  textSoft: 'rgba(255,255,255,0.82)',
  muted: 'rgba(255,255,255,0.60)',
  faint: 'rgba(255,255,255,0.38)',
  slate: '#93AEDD',          // Slate blue — labels, captions

  // ── Semantic ───────────────────────────────────────────────────────────────
  danger: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.14)',
  success: '#22C55E',
  warning: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.14)',

  // ── Legacy aliases (kept so older code keeps compiling) ────────────────────
  appBg: '#112040',
  appText: '#FFFFFF',
  appMuted: 'rgba(255,255,255,0.60)',
  appWhite: 'rgba(255,255,255,0.08)',
  bg: '#112040',
  surface: 'rgba(10,22,40,0.62)',
  glass: 'rgba(10,22,40,0.62)',
  glassStrong: 'rgba(27,50,104,0.55)',
  border: 'rgba(147,174,221,0.22)',
};

export const Fonts = {
  display: 'BarlowCondensed_800ExtraBold',
  displayBlack: 'BarlowCondensed_900Black',
  displayBold: 'BarlowCondensed_700Bold',
  displayItalic: 'BarlowCondensed_800ExtraBold_Italic',
  displayBlackItalic: 'BarlowCondensed_900Black_Italic',
  bold: 'Barlow_700Bold',
  semiBold: 'Barlow_600SemiBold',
  medium: 'Barlow_500Medium',
  regular: 'Barlow_400Regular',
};

// Legacy name
export const Typography = {
  displayFont: Fonts.display,
  boldFont: Fonts.bold,
  semiBoldFont: Fonts.semiBold,
  mediumFont: Fonts.medium,
  regularFont: Fonts.regular,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  gutter: 22, // screen side padding
};

export const Radii = {
  xs: 6,
  sm: 8,
  md: 10,     // inner elements, icon tiles
  lg: 14,     // cards
  xl: 18,     // large feature cards
  pill: 999,  // buttons, chips
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  strong: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  glow: {
    shadowColor: '#F26419',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
};
