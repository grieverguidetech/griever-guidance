import { Platform } from 'react-native';
import { fonts } from '@griever/tokens';

/**
 * The serif family for a weight. Web uses the CSS stack (the font loads from index.html). Native
 * uses the face apps/mobile registers with expo-font, and falls back to the system serif until it
 * has loaded, because a custom family name that is not registered renders in the default font.
 */
export function serifFamily(weight: 'regular' | 'semibold'): string {
  if (Platform.OS === 'web') {
    return fonts.serifWeb;
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
