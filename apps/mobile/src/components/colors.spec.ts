import { describe, expect, it } from '@jest/globals';
import { colors } from '@griever/tokens';
import { ACCENT, ACCENT_TINT, ERROR, FIELD_BORDER, MUTED, MUTED_STRONG, SUCCESS } from './colors';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('mobile colours', () => {
  it('take the web palette from the shared tokens', () => {
    expect(ACCENT).toBe('#006786');
    expect(ACCENT_TINT).toBe('#e9f8ff');
  });

  it.each([
    ['ACCENT', ACCENT, '#ffffff'],
    ['MUTED', MUTED, '#ffffff'],
    ['ERROR', ERROR, '#ffffff'],
    ['SUCCESS', SUCCESS, '#ffffff'],
    ['MUTED_STRONG on the tint', MUTED_STRONG, ACCENT_TINT],
    ['MUTED on the tint', MUTED, ACCENT_TINT],
    ['ACCENT on the tint', ACCENT, ACCENT_TINT],
  ])('%s text is at least 4.5:1', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps field borders at least 3:1 on white', () => {
    expect(contrast(FIELD_BORDER, '#ffffff')).toBeGreaterThanOrEqual(3);
  });

  // #654: Card, PersonRow and the Hub step boxes use neutral-600 (3.85:1 on the page, 3.55:1 on the card fill).
  it.each([
    ['page', colors.bg],
    ['card fill', colors.surface],
  ])('keeps the neutral-600 box border at least 3:1 on the %s', (_name, background) => {
    expect(contrast(colors['neutral-600'], background)).toBeGreaterThanOrEqual(3);
  });
});
