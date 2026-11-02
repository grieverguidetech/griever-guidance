import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '@griever/tokens';
import { useSerifStyle } from './typography';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps {
  /** 1 to 6. On web this becomes the real h1 to h6 element. */
  level: HeadingLevel;
  children: ReactNode;
  /** A DOM node on web, a host instance on native. For moving focus to the heading. */
  headingRef?: ComponentProps<typeof Text>['ref'];
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
  const font = useSerifStyle('semibold');
  return (
    <Text ref={headingRef} style={[styles.base, font, { fontSize: sizeByLevel[level] }]} {...headingProps(level)}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.ink,
  },
});
