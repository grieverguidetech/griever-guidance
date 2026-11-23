import { useFonts } from 'expo-font';
import { Fraunces_300Light } from '@expo-google-fonts/fraunces/300Light';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { fontFamilies } from '../ui/typography';

/**
 * Fraunces (headings) and Nunito Sans (everything else), registered under the native family names in
 * ../ui/typography. No italic is loaded: italic text shows upright. The Expo Fraunces package has
 * static faces only, with no SOFT instance, so headings use Fraunces 300 and 400 as they are.
 * The font files ship inside the app binary (no network at launch, C5), under the SIL Open Font
 * License 1.1; the licence texts are committed at apps/mobile/assets/fonts/Fraunces-OFL.txt and NunitoSans-OFL.txt.
 */
export const serifFontFiles = {
  [fontFamilies.heading.light]: Fraunces_300Light,
  [fontFamilies.heading.regular]: Fraunces_400Regular,
  [fontFamilies.body.regular]: NunitoSans_400Regular,
  [fontFamilies.body.semibold]: NunitoSans_600SemiBold,
};

/**
 * Registers the app fonts. Nothing waits on it: until it is ready, or if it fails, text shows in the
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
