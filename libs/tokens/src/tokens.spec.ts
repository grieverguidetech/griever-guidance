import { colors, fonts, minTouchTarget, radius, spacing } from './index.js';

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

  it('has positive spacing and radii, and a 44 pixel touch target', () => {
    expect(Object.values(spacing).every((value) => value > 0)).toBe(true);
    expect(Object.values(radius).every((value) => value > 0)).toBe(true);
    expect(minTouchTarget).toBe(44);
  });

  it('names a different native family per weight', () => {
    expect(fonts.serifRegular).not.toBe(fonts.serifSemiBold);
  });
});
