/** Shared by Icon.tsx (react-native-svg) and Icon.web.tsx (plain svg): one 24x24 outline per icon. */
export type IconName = 'lock';

export interface IconProps {
  name: IconName;
  /** Pixels. */
  size?: number;
  /** A token colour, for example colors['neutral-700']. */
  color: string;
  /** Sits at the far right of its parent, centred up and down. The parent needs room (padding). */
  trailing?: boolean;
  /** For tests: the lock must be findable even though it is hidden from assistive tech. */
  testID?: string;
}

export const ICON_PATHS: Record<IconName, { body: string; shackle: string }> = {
  // A padlock: a rounded body and a shackle arch.
  lock: {
    body: 'M6 11h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18 21H6a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 6 11z',
    shackle: 'M8 11V7.5a4 4 0 0 1 8 0V11',
  },
};

export const ICON_DEFAULT_SIZE = 20;
