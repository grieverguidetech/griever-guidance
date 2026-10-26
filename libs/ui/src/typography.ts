import { Platform } from 'react-native';
import { fonts } from '@griever/tokens';

/**
 * The serif family for a weight. Web uses the CSS stack (the font loads from index.html). Native
 * uses the face apps/mobile registers with expo-font. Until it has loaded (or if it fails) React
 * Native shows the system font, because a family name that is not registered is ignored.
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
