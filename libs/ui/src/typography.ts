import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { fonts, v2 } from '@griever/tokens';

/** The web family: Sora, from the generated --font-v2 var (apps/web/src/theme.generated.css). */
export const webFontFamily = 'var(--font-v2)';

/** `heading` is the h1 weight (v2.roles.heading). `semibold` is the medium step on web. */
export type SerifWeight = 'heading' | 'regular' | 'semibold';

/**
 * The serif family for a weight. Web uses the CSS stack (the font loads from index.html). Native
 * uses the face apps/mobile registers with expo-font. Until it has loaded (or if it fails) React
 * Native shows the system font, because a family name that is not registered is ignored.
 */
export function serifFamily(weight: SerifWeight, italic = false): string {
  if (Platform.OS === 'web') {
    return webFontFamily;
  }
  if (italic) {
    return weight === 'semibold' ? fonts.serifSemiBoldItalic : fonts.serifItalic;
  }
  return weight === 'semibold' ? fonts.serifSemiBold : fonts.serifRegular;
}

/** `fontWeight` is only meant for the web stack; native picks the weight through the family name. */
export function serifWeight(weight: SerifWeight): '300' | '400' | '500' | undefined {
  if (Platform.OS !== 'web') {
    return undefined;
  }
  const weights = v2.primitives.font.weights;
  if (weight === 'heading') {
    return String(v2.roles.heading.weight) as '300';
  }
  return String(weight === 'semibold' ? weights.medium : weights.regular) as '400';
}

/**
 * Whether the serif has finished loading on native (web and tests: always true). React Native does
 * not re-read a font for text already drawn without it, so the font style below changes when this
 * does, and the text updates. The mobile app provides the value from its font loader.
 */
export const SerifReadyContext = createContext(true);

/** `fontFamily` and `fontWeight` for the serif. Until it is ready on native, the system font. */
export function useSerifStyle(weight: SerifWeight, italic = false): { fontFamily?: string; fontWeight?: '300' | '400' | '500' } {
  const ready = useContext(SerifReadyContext);
  if (Platform.OS !== 'web' && !ready) {
    return {};
  }
  return { fontFamily: serifFamily(weight, italic), fontWeight: serifWeight(weight) };
}
