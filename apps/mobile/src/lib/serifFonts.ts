import { useFonts } from 'expo-font';
import { SourceSerif4_400Regular } from '@expo-google-fonts/source-serif-4/400Regular';
import { SourceSerif4_600SemiBold } from '@expo-google-fonts/source-serif-4/600SemiBold';
import { fonts } from '@griever/tokens';

/**
 * Source Serif 4, the face the web app uses. The family names come from @griever/tokens, so shared
 * components (libs/ui) ask for the same names this registers. Only the two weights the web uses.
 * The font files ship inside the app binary (no network at launch, C5), under the SIL Open Font
 * License 1.1; the licence text is in @expo-google-fonts/source-serif-4/LICENSE_FONT.
 */
export const serifFontFiles = {
  [fonts.serifRegular]: SourceSerif4_400Regular,
  [fonts.serifSemiBold]: SourceSerif4_600SemiBold,
};

/**
 * Registers the serif. Nothing waits on it: until it is ready, or if it fails, text shows in the
 * system font. Waiting would put a blank screen in front of someone who needs the app now.
 */
export function useSerifFonts(): void {
  useFonts(serifFontFiles);
}
