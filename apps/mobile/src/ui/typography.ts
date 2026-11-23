import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { v2, webFontStack, webHeadingFontStack } from '@griever/tokens';

/**
 * The native family names, one per face. These are platform names (the names expo-font registers in
 * lib/serifFonts), so they live here and not in @griever/tokens, which holds the families ("Fraunces",
 * "Nunito Sans") and the weights. Kept free of font imports so the ui layer stays light.
 */
export const fontFamilies = {
  heading: { light: 'Fraunces_300Light', regular: 'Fraunces_400Regular' },
  body: { regular: 'NunitoSans_400Regular', semibold: 'NunitoSans_600SemiBold' },
} as const;

export type FontWeightName = 'light' | 'regular' | 'semibold';
/** Headings (and the eyebrow) are Fraunces; everything else is Nunito Sans. */
export type FontKind = 'heading' | 'body';
export type FontWeightValue = '300' | '400' | '600';

const weightByName = {
  light: v2.primitives.font.weights.light,
  regular: v2.primitives.font.weights.regular,
  semibold: v2.primitives.font.weights.medium,
} as const;

// Fraunces ships 300 and 400 here, Nunito Sans 400 and 600. A weight a family does not ship takes
// its closest face: heading "semibold" is Fraunces 400, body "light" is Nunito Sans 400.
const nativeFamily = {
  heading: { light: fontFamilies.heading.light, regular: fontFamilies.heading.regular, semibold: fontFamilies.heading.regular },
  body: { light: fontFamilies.body.regular, regular: fontFamilies.body.regular, semibold: fontFamilies.body.semibold },
} as const;

/**
 * The family for a weight. Web uses the CSS stack. Native uses the face apps/mobile registers
 * with expo-font. Until it has loaded (or if it fails) React Native shows the system font, because
 * a family name that is not registered is ignored.
 *
 * Native has no SOFT axis: the Expo Fraunces package ships static faces only (SOFT 0), so headings
 * use the closest static weight (300 and 400). Web sets SOFT 100 in its CSS.
 */
export function serifFamily(weight: FontWeightName, kind: FontKind = 'body'): string {
  if (Platform.OS === 'web') {
    return kind === 'heading' ? webHeadingFontStack(v2.primitives) : webFontStack(v2.primitives);
  }
  return nativeFamily[kind][weight];
}

/** `fontWeight` is only meant for the web stack; native picks the weight through the family name. */
export function serifWeight(weight: FontWeightName): FontWeightValue | undefined {
  if (Platform.OS !== 'web') {
    return undefined;
  }
  return String(weightByName[weight]) as FontWeightValue;
}

/**
 * Whether the serif has finished loading on native (web and tests: always true). React Native does
 * not re-read a font for text already drawn without it, so the font style below changes when this
 * does, and the text updates. The mobile app provides the value from its font loader.
 */
export const SerifReadyContext = createContext(true);

/** `fontFamily` and `fontWeight` for the app fonts. Until they are ready on native, the system font. */
export function useSerifStyle(
  weight: FontWeightName,
  kind: FontKind = 'body',
): { fontFamily?: string; fontWeight?: FontWeightValue } {
  const ready = useContext(SerifReadyContext);
  if (Platform.OS !== 'web' && !ready) {
    return {};
  }
  return { fontFamily: serifFamily(weight, kind), fontWeight: serifWeight(weight) };
}
