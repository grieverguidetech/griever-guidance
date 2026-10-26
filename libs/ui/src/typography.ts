import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { fonts } from '@griever/tokens';

/**
 * The serif family for a weight. Web uses the CSS stack (the font loads from index.html). Native
 * uses the face apps/mobile registers with expo-font. Until it has loaded (or if it fails) React
 * Native shows the system font, because a family name that is not registered is ignored.
 */
export function serifFamily(weight: 'regular' | 'semibold', italic = false): string {
  if (Platform.OS === 'web') {
    return fonts.serifWeb;
  }
  if (italic) {
    return weight === 'semibold' ? fonts.serifSemiBoldItalic : fonts.serifItalic;
  }
  return weight === 'semibold' ? fonts.serifSemiBold : fonts.serifRegular;
}

/** `fontWeight` is only meant for the web stack; native picks the weight through the family name. */
export function serifWeight(weight: 'regular' | 'semibold'): '400' | '600' | undefined {
  if (Platform.OS !== 'web') {
    return undefined;
  }
  return weight === 'semibold' ? '600' : '400';
}

/**
 * Whether the serif has finished loading on native (web and tests: always true). React Native does
 * not re-read a font for text already drawn without it, so the font style below changes when this
 * does, and the text updates. The mobile app provides the value from its font loader.
 */
export const SerifReadyContext = createContext(true);

/** `fontFamily` and `fontWeight` for the serif. Until it is ready on native, the system font. */
export function useSerifStyle(weight: 'regular' | 'semibold', italic = false): { fontFamily?: string; fontWeight?: '400' | '600' } {
  const ready = useContext(SerifReadyContext);
  if (Platform.OS !== 'web' && !ready) {
    return {};
  }
  return { fontFamily: serifFamily(weight, italic), fontWeight: serifWeight(weight) };
}
