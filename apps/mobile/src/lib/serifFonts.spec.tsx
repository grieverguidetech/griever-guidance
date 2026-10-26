import { describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import { fonts } from '@griever/tokens';

const mockUseFonts = jest.fn<(map: Record<string, unknown>) => [boolean, Error | null]>(() => [false, null]);
jest.mock('expo-font', () => ({ useFonts: (map: Record<string, unknown>) => mockUseFonts(map) }));

import { serifFontFiles, useSerifFonts } from './serifFonts';

const Probe = () => {
  useSerifFonts();
  return null;
};

describe('serif fonts', () => {
  it('registers regular and semibold under the names in @griever/tokens', () => {
    expect(Object.keys(serifFontFiles).sort()).toEqual([fonts.serifRegular, fonts.serifSemiBold].sort());
  });

  it('bundles a font file for each name', () => {
    for (const file of Object.values(serifFontFiles)) {
      expect(file).toBeTruthy();
    }
  });

  it('asks expo-font to load them without blocking the screen', () => {
    const screen = render(<Probe />);
    expect(mockUseFonts).toHaveBeenCalledWith(serifFontFiles);
    expect(screen.toJSON()).toBeNull();
  });
});
