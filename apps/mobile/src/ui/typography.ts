import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { v2 } from '@griever/tokens';

/**
 * The native family names for Sora, one per weight. These are platform names (the names expo-font
 * registers in lib/serifFonts), so they live here and not in @griever/tokens, which holds the
 * family ("Sora") and the weights. Kept free of font imports so the ui layer stays light.
 */
export const soraFamilies = {
  light: 'Sora_300Light',
  regular: 'Sora_400Regular',
  medium: 'Sora_500Medium',
} as const;

export type FontWeightName = 'light' | 'regular' | 'semibold';

// Sora ships 300, 400 and 500, so "semibold" (anything 500 and up) is Sora 500.
const weightByName = {
  light: v2.primitives.font.weights.light,
  regular: v2.primitives.font.weights.regular,
  semibold: v2.primitives.font.weights.medium,
} as const;

const webStack = `${v2.primitives.font.family}, system-ui, -apple-system, 'Segoe UI', sans-serif`;

const nativeFamily = {
  light: soraFamilies.light,
  regular: soraFamilies.regular,
  semibold: soraFamilies.medium,
} as const;

/**
 * The Sora family for a weight. Web uses the CSS stack. Native uses the face apps/mobile registers
 * with expo-font. Until it has loaded (or if it fails) React Native shows the system font, because
 * a family name that is not registered is ignored.
 */
export function serifFamily(weight: FontWeightName): string {
  if (Platform.OS === 'web') {
    return webStack;
  }
  return nativeFamily[weight];
}

/** `fontWeight` is only meant for the web stack; native picks the weight through the family name. */
export function serifWeight(weight: FontWeightName): '300' | '400' | '500' | undefined {
  if (Platform.OS !== 'web') {
    return undefined;
  }
  return String(weightByName[weight]) as '300' | '400' | '500';
}

/**
 * Whether the serif has finished loading on native (web and tests: always true). React Native does
 * not re-read a font for text already drawn without it, so the font style below changes when this
 * does, and the text updates. The mobile app provides the value from its font loader.
 */
export const SerifReadyContext = createContext(true);

/** `fontFamily` and `fontWeight` for Sora. Until it is ready on native, the system font. */
export function useSerifStyle(weight: FontWeightName): { fontFamily?: string; fontWeight?: '300' | '400' | '500' } {
  const ready = useContext(SerifReadyContext);
  if (Platform.OS !== 'web' && !ready) {
    return {};
  }
  return { fontFamily: serifFamily(weight), fontWeight: serifWeight(weight) };
}
