import type { ComponentProps } from 'react';
import { Platform, StyleSheet, Text, TextInput } from 'react-native';
import { useSerifStyle } from './typography';

// The web stack has only 400 and 600, so 500 reads as semibold too.
const SEMIBOLD = new Set(['500', '600', '700', '800', '900', 'bold']);

/**
 * The serif for the caller's weight and slant. Does nothing if the caller chose its own family.
 * On native the face carries weight and slant, so the caller's fontWeight and fontStyle are cleared
 * (a "bold" must not stack on the semibold face).
 */
function useFontFor(style: ComponentProps<typeof Text>['style']) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight;
  const font = useSerifStyle(
    weight !== undefined && SEMIBOLD.has(String(weight)) ? 'semibold' : 'regular',
    flat?.fontStyle === 'italic',
  );
  if (flat?.fontFamily || !font.fontFamily) {
    return style;
  }
  const native = Platform.OS !== 'web';
  return [font, style, native ? { fontWeight: undefined, fontStyle: undefined } : { fontWeight: font.fontWeight }];
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
