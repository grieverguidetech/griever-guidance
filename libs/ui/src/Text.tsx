import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '@griever/tokens';
import { serifFamily, serifWeight } from './typography';

export interface EyebrowProps {
  children: ReactNode;
}

/** The small accent line above a heading, for example "For Margaret". */
export function Eyebrow({ children }: EyebrowProps) {
  return <Text style={styles.eyebrow}>{children}</Text>;
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
}

/** Running text. Contrast: neutral-700 and neutral-800 on the page colour both pass 4.5:1. */
export function Body({ children, tone = 'default', small = false, id, hidden = false }: BodyProps) {
  const extra: Record<string, unknown> = {};
  if (id) {
    extra['id'] = id;
  }
  if (hidden) {
    extra['aria-hidden'] = true;
  }
  return <Text style={[styles.body, styles[tone], small && styles.small]} {...extra}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: serifFamily('regular'),
    fontWeight: serifWeight('regular'),
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors['accent-700'],
  },
  body: {
    fontFamily: serifFamily('regular'),
    fontWeight: serifWeight('regular'),
    fontSize: 13,
    lineHeight: 20,
  },
  default: { color: colors['neutral-800'] },
  strong: { color: colors.ink },
  muted: { color: colors['neutral-700'] },
  small: { fontSize: 12, lineHeight: 18 },
});
