import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useSerifStyle } from './typography';

// Nunito Sans loads 400 and 600 only, so 500 and heavier map to 600.
const SEMIBOLD = new Set(['500', '600', '700', '800', '900', 'bold']);

/**
 * The app font for the caller's weight. Does nothing if the caller chose its own family.
 */
function useFontFor(style: ComponentProps<typeof Text>['style']) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight;
  const font = useSerifStyle(weight !== undefined && SEMIBOLD.has(String(weight)) ? 'semibold' : 'regular');
  if (flat?.fontFamily) {
    return style;
  }
  return [font, style, { fontWeight: font.fontWeight }];
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
