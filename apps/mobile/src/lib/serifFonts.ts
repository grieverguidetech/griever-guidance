import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular } from '@expo-google-fonts/source-serif-4/400Regular';
import { SourceSerif4_600SemiBold } from '@expo-google-fonts/source-serif-4/600SemiBold';
import { fonts } from '@griever/tokens';

/**
 * Source Serif 4, the face the web app uses. The family names come from @griever/tokens, so shared
 * components (libs/ui) ask for the same names this registers. Only the two weights the web uses.
 * The font files ship inside the app binary (no network at launch, C5), under the SIL Open Font
 * License 1.1; the licence text is committed at apps/mobile/assets/fonts/SourceSerif4-OFL.txt.
 */
export const serifFontFiles = {
  [fonts.serifRegular]: SourceSerif4_400Regular,
  [fonts.serifSemiBold]: SourceSerif4_600SemiBold,
};

/**
 * Registers the serif. Nothing waits on it: until it is ready, or if it fails, text shows in the
 * system font. Waiting would put a blank screen in front of someone who needs the app now.
 *
 * Returns true once the fonts have loaded (or failed). React Native does not re-read a font family
 * for text that already drew in the system font, so libs/ui changes its font style when this turns true
 * (SerifReadyContext).
 */
export function useSerifFonts(): boolean {
  const [loaded, error] = useFonts(serifFontFiles);
  return loaded || error !== null;
}
