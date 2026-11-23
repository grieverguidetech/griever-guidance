import type { ComponentProps, ReactNode } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { v2 } from '@griever/tokens';
import { useSerifStyle } from './typography';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps {
  /** 1 to 6. On web this becomes the real h1 to h6 element. */
  level: HeadingLevel;
  children: ReactNode;
  /** A DOM node on web, a host instance on native. For moving focus to the heading. */
  headingRef?: ComponentProps<typeof Text>['ref'];
}

const webHeadingColor = 'var(--color-v2-heading)';

/** Web reads the v2 heading var; native keeps ink. (jsdom drops a var() colour, so tests call this.) */
export function headingColor(): string {
  return Platform.OS === 'web' ? webHeadingColor : v2.roles.ink;
}

const sizeByLevel: Record<HeadingLevel, number> = { 1: 22, 2: 17, 3: 15, 4: 14, 5: 13, 6: 12 };

/**
 * react-native-web reads `aria-level` to choose h1 to h6. The react-native types do not list it on
 * Text, so the props are built here and typed loosely in one place.
 */
function headingProps(level: HeadingLevel): Record<string, unknown> {
  return { role: 'heading', 'aria-level': level, accessibilityRole: 'header' };
}

export function Heading({ level, children, headingRef }: HeadingProps) {
  // Web (Sora): h1 is light, the rest regular. Native keeps its semibold face.
  const webWeight = level === 1 ? 'heading' : 'regular';
  const font = useSerifStyle(Platform.OS === 'web' ? webWeight : 'semibold');
  // On web the heading colour comes from the v2 var, so a brand change reaches every heading.
  const color = headingColor();
  return (
    <Text ref={headingRef} style={[styles.base, font, { color }, { fontSize: sizeByLevel[level] }]} {...headingProps(level)}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: v2.roles.ink,
  },
});
