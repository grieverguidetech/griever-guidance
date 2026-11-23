import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import { v2 } from '@griever/tokens';
import { App } from '../app/App';

// Fonts never finish loading in these tests: the app must not wait for them.
const mockUseFonts = jest.fn<(map: Record<string, unknown>) => [boolean, Error | null]>(() => [false, null]);
jest.mock('expo-font', () => ({ useFonts: (map: Record<string, unknown>) => mockUseFonts(map) }));

import { serifFontFiles, soraFamilies } from './serifFonts';

describe('serif fonts', () => {
  it('registers Sora 300, 400 and 500 only, for the family in @griever/tokens', () => {
    expect(v2.primitives.font.family).toBe('Sora');
    expect(v2.primitives.font.weights).toEqual({ light: 300, regular: 400, medium: 500 });
    expect(Object.keys(serifFontFiles).sort()).toEqual([soraFamilies.light, soraFamilies.regular, soraFamilies.medium].sort());
    expect(Object.keys(serifFontFiles).every((name) => name.startsWith('Sora_'))).toBe(true);
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
