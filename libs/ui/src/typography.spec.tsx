import { render, screen } from '@testing-library/react';
import { v2 } from '@griever/tokens';
import * as tokens from '@griever/tokens';
import { Body, Eyebrow } from './Text';
import { Button } from './Button';
import { serifFamily, serifWeight, webFontFamily } from './typography';

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

  it('uses the --font-v2 var for the family', () => {
    expect(webFontFamily).toBe('var(--font-v2)');
    expect(serifFamily()).toBe(webFontFamily);
  });
});

describe('one font for all text', () => {
  it('Body, Eyebrow and Button labels use the --font-v2 family', () => {
    render(
      <>
        <Eyebrow>Eyebrow text</Eyebrow>
        <Body>Body text</Body>
        <Button label="Go" onPress={vi.fn()} variant="tinted" />
      </>,
    );
    for (const text of ['Eyebrow text', 'Body text', 'Go']) {
      expect(family(text)).toContain('var(--font-v2)');
    }
  });

  it('no Source Serif family name is exported by tokens (#1010)', () => {
    expect('fonts' in tokens).toBe(false);
  });
});
