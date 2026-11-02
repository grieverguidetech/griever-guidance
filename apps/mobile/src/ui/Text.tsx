import type { ComponentRef, ReactNode, Ref } from 'react';
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

/** `danger` is for a calm error line (the same red as the error under the contact form). */
export type BodyTone = 'default' | 'strong' | 'muted' | 'danger';

export interface BodyProps {
  children: ReactNode;
  tone?: BodyTone;
  /** Marks a secondary line (a date, a status). Same size as body since #654 (15 pt is the floor); pair with tone="muted". */
  small?: boolean;
  /** Web: gives the text an id so a control can point to it with aria-describedby. */
  id?: string;
  /** Hidden from assistive tech, for text that is read another way (a hint, a description). */
  hidden?: boolean;
  /** Read out politely when the text changes (a count, a status). */
  live?: boolean;
  /** Makes the text tappable, for example a field label that focuses its field. */
  onPress?: () => void;
  /** Native: lets a screen move the screen reader's focus to this line. */
  textRef?: Ref<ComponentRef<typeof Text>>;
}

/** Running text. Contrast: neutral-700 and neutral-800 on the page colour both pass 4.5:1. */
export function Body({ children, tone = 'default', small = false, id, hidden = false, live = false, onPress, textRef }: BodyProps) {
  const font = useSerifStyle('regular');
  const extra: Record<string, unknown> = {};
  if (id) {
    extra['id'] = id;
  }
  if (hidden) {
    extra['aria-hidden'] = true;
    extra['accessibilityElementsHidden'] = true;
    extra['importantForAccessibility'] = 'no-hide-descendants';
  }
  if (live) {
    extra['role'] = 'status';
    extra['accessibilityLiveRegion'] = 'polite';
  }
  return <Text ref={textRef} style={[styles.body, font, styles[tone], small && styles.small]} onPress={onPress} {...extra}>{children}</Text>;
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
    fontSize: 15,
    lineHeight: 22,
  },
  default: { color: colors['neutral-800'] },
  strong: { color: colors.ink },
  muted: { color: colors['neutral-700'] },
  danger: { color: '#b91c1c' },
  small: { fontSize: 15, lineHeight: 22 },
});
