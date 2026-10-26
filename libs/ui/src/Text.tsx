import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '@griever/tokens';
import { useSerifStyle } from './typography';

export interface EyebrowProps {
  children: ReactNode;
  /** `accent2` is the second accent (a magenta), for the Announce screen. */
  tone?: 'accent' | 'accent2';
}

/** The small accent line above a heading, for example "For Margaret". */
export function Eyebrow({ children, tone = 'accent' }: EyebrowProps) {
  const font = useSerifStyle('regular');
  return <Text style={[styles.eyebrow, tone === 'accent2' && styles.accent2, font]}>{children}</Text>;
}

export type BodyTone = 'default' | 'strong' | 'muted';

export interface BodyProps {
  children: ReactNode;
  tone?: BodyTone;
  /** Smaller grey line for details such as a date. */
  small?: boolean;
  /** Web: gives the text an id so a control can point to it with aria-describedby. */
  id?: string;
  /** Hidden from assistive tech, for text that is read another way (a hint, a description). */
  hidden?: boolean;
  /** Read out politely when the text changes (a count, a status). */
  live?: boolean;
}

/** Running text. Contrast: neutral-700 and neutral-800 on the page colour both pass 4.5:1. */
export function Body({ children, tone = 'default', small = false, id, hidden = false, live = false }: BodyProps) {
  const font = useSerifStyle('regular');
  const extra: Record<string, unknown> = {};
  if (id) {
    extra['id'] = id;
  }
  if (hidden) {
    extra['aria-hidden'] = true;
  }
  if (live) {
    extra['role'] = 'status';
    extra['accessibilityLiveRegion'] = 'polite';
  }
  return <Text style={[styles.body, font, styles[tone], small && styles.small]} {...extra}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors['accent-700'],
  },
  accent2: { color: colors['accent-2-700'] },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
  default: { color: colors['neutral-800'] },
  strong: { color: colors.ink },
  muted: { color: colors['neutral-700'] },
  small: { fontSize: 12, lineHeight: 18 },
});
