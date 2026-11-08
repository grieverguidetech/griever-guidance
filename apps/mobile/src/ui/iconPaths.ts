/** Used by Icon.tsx (react-native-svg): the shapes of each icon, in that icon's own viewBox. */
export type IconName = 'lock' | 'check' | 'progress' | 'circle';

export interface IconProps {
  name: IconName;
  /** Pixels. */
  size?: number;
  /** A token colour, for example colors['neutral-700']. */
  color: string;
  /** Sits at the far right of its parent, centred up and down. The parent needs room (padding). */
  trailing?: boolean;
  /** For tests: the icon must be findable even though it is hidden from assistive tech. */
  testID?: string;
}

/** One drawn shape. `fill` shapes are filled with the icon colour; the rest are outlines. */
export type IconShape =
  | { kind: 'path'; d: string; fill?: boolean; linecap?: 'round'; linejoin?: 'round' }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export interface IconSpec {
  viewBox: string;
  strokeWidth: number;
  shapes: IconShape[];
}

const CIRCLE: IconShape = { kind: 'circle', cx: 8, cy: 8, r: 5.5 };

export const ICON_PATHS: Record<IconName, IconSpec> = {
  // A padlock: a rounded body and a shackle arch (24-unit viewBox).
  lock: {
    viewBox: '0 0 24 24',
    strokeWidth: 1.8,
    shapes: [
      {
        kind: 'path',
        d: 'M6 11h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 11z',
        linejoin: 'round',
      },
      { kind: 'path', d: 'M8 11V7.5a4 4 0 0 1 8 0V11', linecap: 'round' },
    ],
  },
  // The web check mark (16-unit viewBox).
  check: {
    viewBox: '0 0 16 16',
    strokeWidth: 2,
    shapes: [{ kind: 'path', d: 'M3 8.5l3.2 3.2L13 4.8', linecap: 'round', linejoin: 'round' }],
  },
  // Not started: an empty circle.
  circle: { viewBox: '0 0 16 16', strokeWidth: 1.5, shapes: [CIRCLE] },
  // In progress: the same circle with its left half filled.
  progress: {
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
    shapes: [CIRCLE, { kind: 'path', d: 'M8 2.5A5.5 5.5 0 0 0 8 13.5z', fill: true }],
  },
};

export const ICON_DEFAULT_SIZE = 20;
