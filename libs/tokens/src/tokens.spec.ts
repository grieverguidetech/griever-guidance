import { colors, fonts, minTouchTarget, radius, spacing } from './index.js';

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// The check that the web theme equals these values lives in apps/web/src/tokens.spec.ts, so it
// reruns when styles.css changes.
describe('tokens', () => {
  it('has only six-digit hex colours', () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('uses #0088b0 as the base accent', () => {
    expect(colors.accent).toBe('#0088b0');
  });

  it('has a success-700 green with at least 4.5:1 contrast on bg and surface', () => {
    expect(colors['success-700']).toBe('#2a7048');
    expect(contrast(colors['success-700'], colors.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors['success-700'], colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('has positive spacing and radii, and a 44 pixel touch target', () => {
    expect(Object.values(spacing).every((value) => value > 0)).toBe(true);
    expect(Object.values(radius).every((value) => value > 0)).toBe(true);
    expect(minTouchTarget).toBe(44);
  });

  it('names a different native family per weight', () => {
    expect(fonts.serifRegular).not.toBe(fonts.serifSemiBold);
  });
});
