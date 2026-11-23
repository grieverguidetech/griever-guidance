import { useFonts } from 'expo-font';
import { Sora_300Light } from '@expo-google-fonts/sora/300Light';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { soraFamilies } from '../ui/typography';

/**
 * Sora, registered under the native family names in ../ui/typography. Sora has no italic: italic
 * text shows upright Sora.
 * The font files ship inside the app binary (no network at launch, C5), under the SIL Open Font
 * License 1.1; the licence text is committed at apps/mobile/assets/fonts/Sora-OFL.txt.
 */
export const serifFontFiles = {
  [soraFamilies.light]: Sora_300Light,
  [soraFamilies.regular]: Sora_400Regular,
  [soraFamilies.medium]: Sora_500Medium,
};

/**
 * Registers Sora. Nothing waits on it: until it is ready, or if it fails, text shows in the
 * system font. Waiting would put a blank screen in front of someone who needs the app now.
 *
 * Returns true once the fonts have loaded (or failed). React Native does not re-read a font family
 * for text that already drew in the system font, so apps/mobile/src/ui changes its font style when this turns true
 * (SerifReadyContext).
 */
export function useSerifFonts(): boolean {
  const [loaded, error] = useFonts(serifFontFiles);
  return loaded || error !== null;
}
