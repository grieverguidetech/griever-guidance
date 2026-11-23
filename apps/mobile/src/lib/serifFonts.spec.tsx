import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { v2 } from '@griever/tokens';
import { App } from '../app/App';

// Fonts never finish loading in these tests: the app must not wait for them.
const mockUseFonts = jest.fn<(map: Record<string, unknown>) => [boolean, Error | null]>(() => [false, null]);
jest.mock('expo-font', () => ({ useFonts: (map: Record<string, unknown>) => mockUseFonts(map) }));

import { Fraunces_300Light } from '@expo-google-fonts/fraunces/300Light';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { fontFamilies } from '../ui/typography';
import { serifFontFiles } from './serifFonts';

describe('serif fonts', () => {
  it('registers Fraunces 300 and 400 and Nunito Sans 400 and 600 only, for the families in @griever/tokens', () => {
    expect(v2.primitives.font.headingFamily).toBe('Fraunces');
    expect(v2.primitives.font.bodyFamily).toBe('Nunito Sans');
    expect(v2.primitives.font.weights).toEqual({ light: 300, regular: 400, medium: 600 });
    expect(Object.keys(serifFontFiles).sort()).toEqual(
      [fontFamilies.heading.light, fontFamilies.heading.regular, fontFamilies.body.regular, fontFamilies.body.semibold].sort(),
    );
    expect(Object.keys(serifFontFiles).every((name) => name.startsWith('Fraunces_') || name.startsWith('NunitoSans_'))).toBe(true);
  });

  it('maps each family name to its own weight file', () => {
    expect(serifFontFiles[fontFamilies.heading.light]).toBe(Fraunces_300Light);
    expect(serifFontFiles[fontFamilies.heading.regular]).toBe(Fraunces_400Regular);
    expect(serifFontFiles[fontFamilies.body.regular]).toBe(NunitoSans_400Regular);
    expect(serifFontFiles[fontFamilies.body.semibold]).toBe(NunitoSans_600SemiBold);
  });

  it('bundles a font file for each name', () => {
    for (const file of Object.values(serifFontFiles)) {
      expect(file).toBeTruthy();
    }
  });

  it('shows the first screen while the fonts are still loading', async () => {
    render(<App />);
    expect(mockUseFonts).toHaveBeenCalledWith(serifFontFiles);
    expect(await screen.findByText("Who you're writing about")).toBeTruthy();
  });
});
