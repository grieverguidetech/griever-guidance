import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { fonts } from '@griever/tokens';
import { App } from '../app/App';

// Fonts never finish loading in these tests: the app must not wait for them.
const mockUseFonts = jest.fn<(map: Record<string, unknown>) => [boolean, Error | null]>(() => [false, null]);
jest.mock('expo-font', () => ({ useFonts: (map: Record<string, unknown>) => mockUseFonts(map) }));

import { serifFontFiles } from './serifFonts';

describe('serif fonts', () => {
  it('registers regular and semibold, with italics, under the names in @griever/tokens', () => {
    expect(Object.keys(serifFontFiles).sort()).toEqual([fonts.serifRegular, fonts.serifSemiBold, fonts.serifItalic, fonts.serifSemiBoldItalic].sort());
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
