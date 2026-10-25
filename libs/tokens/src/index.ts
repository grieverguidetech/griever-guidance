// PROTOTYPE #322: values copied from apps/web/src/styles.css @theme. Throwaway.
export const PROTOTYPE_COLORS = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  ink: '#201e1d',
  accent: '#0088b0',
  accent700: '#006786',
  accent800: '#004961',
  neutral500: '#9b9797',
  neutral600: '#7d7979',
  neutral700: '#605d5d',
  neutral800: '#444141',
} as const;

export const PROTOTYPE_SPACING = { 1: 4, 2: 8, 3: 16, 4: 24 } as const;

export const PROTOTYPE_RADIUS = { md: 10 } as const;

/** Web loads Source Serif 4 from CSS. Native has no font bundled yet, so it falls back to Georgia. */
export const PROTOTYPE_FONT_SERIF_WEB = "'Source Serif 4', Georgia, 'Times New Roman', serif";
export const PROTOTYPE_FONT_SERIF_NATIVE = 'Georgia';
