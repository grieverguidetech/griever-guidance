import { render, screen } from '@testing-library/react';
import { v2 } from '@griever/tokens';
import * as tokens from '@griever/tokens';
import { Body, Eyebrow } from './Text';
import { Button } from './Button';
import { serifFamily, serifWeight, webEyebrowFontFamily, webFontFamily } from './typography';

function family(text: string): string {
  return getComputedStyle(screen.getByText(text)).fontFamily;
}

describe('serifWeight', () => {
  it('maps the steps to the v2 token weights', () => {
    const { weights } = v2.primitives.font;
    expect(serifWeight('heading')).toBe(String(v2.roles.heading.weight));
    expect(serifWeight('regular')).toBe(String(weights.regular));
    expect(serifWeight('semibold')).toBe(String(weights.medium));
  });

  it('uses the 600 emphasis weight for semibold', () => {
    expect(serifWeight('semibold')).toBe('600');
  });

  it('uses the --font-v2-body var for body steps and --font-v2-heading for heading steps', () => {
    expect(webFontFamily).toBe('var(--font-v2-body)');
    expect(serifFamily()).toBe(webFontFamily);
    expect(serifFamily('regular')).toBe(webFontFamily);
    expect(serifFamily('semibold')).toBe(webFontFamily);
    expect(serifFamily('heading')).toBe('var(--font-v2-heading)');
    expect(serifFamily('headingRegular')).toBe('var(--font-v2-heading)');
    expect(serifWeight('headingRegular')).toBe('400');
  });
});

describe('one font for all text', () => {
  it('Body, Eyebrow and Button labels use the --font-v2-body family', () => {
    render(
      <>
        <Eyebrow>Eyebrow text</Eyebrow>
        <Body>Body text</Body>
        <Button label="Go" onPress={vi.fn()} variant="tinted" />
      </>,
    );
    for (const text of ['Body text', 'Go']) {
      expect(family(text)).toContain('var(--font-v2-body)');
    }
  });

  it('the Eyebrow reads the eyebrow role: the --font-v2-eyebrow var, and the role names the body family', () => {
    expect(v2.roles.eyebrow.family).toBe(v2.primitives.font.bodyFamily);
    expect(webEyebrowFontFamily).toBe('var(--font-v2-eyebrow)');
    render(<Eyebrow>Eyebrow line</Eyebrow>);
    expect(family('Eyebrow line')).toContain('var(--font-v2-eyebrow)');
  });

  it('no Source Serif family name is exported by tokens (#1010)', () => {
    expect('fonts' in tokens).toBe(false);
  });
});
