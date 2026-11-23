import { describe, expect, it } from '@jest/globals';
import { v2 } from '@griever/tokens';
import { eyebrowKind, fontFamilies, serifFamily } from './typography';

describe('native font faces', () => {
  it('maps heading weights to Fraunces', () => {
    expect(serifFamily('light', 'heading')).toBe(fontFamilies.heading.light);
    expect(serifFamily('regular', 'heading')).toBe(fontFamilies.heading.regular);
  });

  it('maps body weights to Nunito Sans', () => {
    expect(serifFamily('regular', 'body')).toBe(fontFamilies.body.regular);
    expect(serifFamily('semibold', 'body')).toBe(fontFamilies.body.semibold);
    expect(serifFamily('regular')).toBe(fontFamilies.body.regular);
  });

  it('falls back on purpose to the closest shipped face: heading semibold is Fraunces 400, body light is Nunito Sans 400', () => {
    expect(serifFamily('semibold', 'heading')).toBe('Fraunces_400Regular');
    expect(serifFamily('light', 'body')).toBe('NunitoSans_400Regular');
  });

  it('draws the eyebrow in the kind named by the eyebrow role (body)', () => {
    expect(v2.roles.eyebrow.family).toBe(v2.primitives.font.bodyFamily);
    expect(eyebrowKind).toBe('body');
  });
});
