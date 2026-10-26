import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useSerifStyle } from './typography';

const BOLD = new Set(['600', '700', '800', '900', 'bold']);

/** Semibold where the caller asked for a bold weight, otherwise regular. */
function useFontFor(style: ComponentProps<typeof Text>['style']) {
  const weight = StyleSheet.flatten(style)?.fontWeight;
  const font = useSerifStyle(weight !== undefined && BOLD.has(String(weight)) ? 'semibold' : 'regular');
  // The weight comes from the family on native; a caller's "bold" must not stack on the semibold face.
  return [font, style, font.fontFamily ? { fontWeight: font.fontWeight } : null];
}

/**
 * A drop-in for React Native's Text that uses the app serif (system font until it loads). For screens
 * that have not moved to Body or Heading yet. A caller's own font family still wins; its weight maps to the serif face.
 */
export function SerifText({ style, ...rest }: ComponentProps<typeof Text>) {
  const fontStyle = useFontFor(style);
  return <Text {...rest} style={fontStyle} />;
}

/** A drop-in for React Native's TextInput that uses the app serif. */
export function SerifTextInput({ style, ...rest }: ComponentProps<typeof TextInput>) {
  const fontStyle = useFontFor(style);
  return <TextInput {...rest} style={fontStyle} />;
}
