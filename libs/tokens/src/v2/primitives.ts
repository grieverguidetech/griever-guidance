/**
 * Layer 1 of the v2 design tokens: raw values only. A brand change edits this file and nothing
 * else. Roles and recipes point here and hold no colour literals of their own.
 */

export type Shadow = { x: number; y: number; blur: number; color: string };
export type Gradient = { stops: readonly string[]; angle: number };

const colors = {
  page: '#f8f7f4',
  glowSun: '#fcefd6',
  glowSky: '#ddebf4',
  ink: '#1b2433',
  heading: '#114465',
  eyebrow: '#67625a',

  // The swirl set. Sea is #279084, darker than the first design (#2a9d8f), so it keeps 3:1 on the glows.
  ocean: '#1e7bb8',
  sea: '#279084',
  lavender: '#7b6fd0',
  sunGold: '#f6c56b',

  glassFill: 'rgba(255,255,255,0.65)',
  glassBorder: 'rgba(255,255,255,0.95)',

  primaryText: '#2a1f12',
  primaryBorder: '#a7774b',
  secondaryText: '#10324d',
  secondaryBorder: '#4f86ad',
  nudgeText: '#0f2f4a',
  nudgeBorder: 'rgba(30,123,184,0.35)',
  openRing: '#6f6a62',

  // Controls and states, copied value for value from the old look (the v1 tokens, deleted in #1010, mobile colors.ts and web styles.css).
  link: '#006786', // accent-700
  wash: '#e9f8ff', // accent-100, the selected-row fill
  muted: '#605d5d', // neutral-700
  mutedStrong: '#444141', // neutral-800
  divider: 'rgba(32,30,29,0.16)', // web --color-divider: #201e1d at 16%
  error: '#b3261e', // web value, chosen over mobile's #b91c1c (D2)
  success: '#2a7048', // web value, chosen over mobile's #2f7a50 (D2)
  fieldFill: '#eae9e9', // web --color-surface
  // neutral-600: mobile's FIELD_BORDER and web's panel rule. Web's plain .gg-input border today is the 16% divider (fails 3:1); v2 uses neutral-600 everywhere on purpose.
  fieldEdge: '#7d7979',
  fieldFocus: '#006786', // accent-700
} as const;

/** One angle for every linear swirl. */
const swirlAngle = 120;

const gradients = {
  sunset: { stops: ['#f9d697', '#f7cd94', '#f9d9bd'], angle: swirlAngle },
  softOcean: { stops: ['#a5cbe3', '#a9d6d0', '#c6c0eb'], angle: swirlAngle },
  pastel: { stops: ['#dcebf5', '#e3f1ee', '#e9e6f8'], angle: swirlAngle },
} as const satisfies Record<string, Gradient>;

const shadows = {
  glass: { x: 0, y: 1, blur: 9, color: 'rgba(20,50,80,0.065)' },
  sunset: { x: 0, y: 2, blur: 12, color: 'rgba(150,90,30,0.12)' },
  nudgeNear: { x: 0, y: 3, blur: 6, color: 'rgba(15,47,74,0.28)' },
  nudgeFar: { x: 0, y: 1, blur: 2, color: 'rgba(15,47,74,0.13)' },
} as const satisfies Record<string, Shadow>;

export const primitives = {
  colors,
  gradients,
  shadows,
  font: {
    family: 'Sora',
    // No italic: italic text shows upright Sora.
    weights: { light: 300, regular: 400, medium: 500 },
  },
  size: {
    body: 15,
    eyebrow: 13,
    /** Letter-spacing of the eyebrow, in em. */
    eyebrowTracking: 0.08,
    orb: 22,
    mark: 16,
  },
  radius: 8,
  border: { thin: 1, medium: 1.5 },
  /** Alpha of the nudge card speckles. */
  speckleAlpha: 0.28,
  /** Milliseconds. All of it stops under the OS Reduce Motion setting. */
  motion: { driftMs: 9000, spinMs: 12000, settleMs: 4500 },
} as const;

type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends readonly string[]
      ? readonly string[]
      : T extends object
        ? { -readonly [K in keyof T]: Widen<T[K]> }
        : T;

/** The shape of the primitives with plain string and number types, so a fixture can swap values. */
export type Primitives = Widen<typeof primitives>;
