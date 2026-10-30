/**
 * Design tokens shared by web and mobile. The web `@theme` block in apps/web/src/styles.css must
 * hold the same colour and font values; tokens.spec.ts fails when the two drift apart.
 */

/** Keys match the Tailwind `--color-*` names, so `accent-700` is `--color-accent-700`. */
export const colors = {
  bg: '#f3f2f2',
  white: '#ffffff',
  surface: '#eae9e9',
  ink: '#201e1d',
  accent: '#0088b0',
  'accent-2': '#d6006c',

  'neutral-100': '#f8f4f4',
  'neutral-200': '#eae7e7',
  'neutral-300': '#d7d3d3',
  'neutral-400': '#bab6b6',
  'neutral-500': '#9b9797',
  'neutral-600': '#7d7979',
  'neutral-700': '#605d5d',
  'neutral-800': '#444141',
  'neutral-900': '#2d2b2b',

  'accent-100': '#e9f8ff',
  'accent-200': '#cbeeff',
  'accent-300': '#99e0ff',
  'accent-400': '#62c5ee',
  'accent-500': '#38a6cf',
  'accent-600': '#1186ac',
  'accent-700': '#006786',
  'accent-800': '#004961',
  'accent-900': '#0a303e',

  'accent-2-100': '#fff1f4',
  'accent-2-200': '#ffdee6',
  'accent-2-300': '#ffc0d0',
  'accent-2-400': '#ff90b1',
  'accent-2-500': '#ff458e',
  'accent-2-600': '#d82071',
  'accent-2-700': '#aa0b56',
  'accent-2-800': '#790e3d',
  'accent-2-900': '#4b1528',

  /** Done check marks. Calm green, at least 4.5:1 on bg and surface. */
  'success-700': '#2a7048',
} as const;

export type ColorToken = keyof typeof colors;

/** The web stack, as written in the CSS. */
export const fontSerifStack = "'Source Serif 4', Georgia, 'Times New Roman', serif";

/**
 * Font family names as React Native knows them. On web the CSS stack above is used. On native the
 * names are the ones apps/mobile registers with expo-font.
 */
export const fonts = {
  serifWeb: fontSerifStack,
  serifRegular: 'SourceSerif4_400Regular',
  serifSemiBold: 'SourceSerif4_600SemiBold',
  serifItalic: 'SourceSerif4_400Regular_Italic',
  serifSemiBoldItalic: 'SourceSerif4_600SemiBold_Italic',
} as const;

/** Pixels. Keys match the `--space-*` custom properties. */
export const spacing = { 1: 5, 2: 10, 3: 15, 4: 20, 6: 30, 8: 40 } as const;

/** Pixels. Keys match the `--radius-*` custom properties. */
export const radius = { sm: 1, md: 2, lg: 4 } as const;

/** The smallest touch target, in pixels (REQUIREMENTS.md accessibility rules). */
export const minTouchTarget = 44;
