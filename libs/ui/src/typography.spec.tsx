import { render, screen } from '@testing-library/react';
import { Platform } from 'react-native';
import { fonts, v2 } from '@griever/tokens';
import { Body, Eyebrow } from './Text';
import { Button } from './Button';
import { SerifReadyContext, serifWeight, webFontFamily } from './typography';

function family(text: string): string {
  return getComputedStyle(screen.getByText(text)).fontFamily;
}

function renderAll(ready: boolean) {
  render(
    <SerifReadyContext.Provider value={ready}>
      <Eyebrow>Eyebrow text</Eyebrow>
      <Body>Body text</Body>
      <Button label="Go" onPress={vi.fn()} variant="tinted" />
    </SerifReadyContext.Provider>,
  );
}

describe('serifWeight on web', () => {
  it('maps the steps to the v2 token weights', () => {
    const { weights } = v2.primitives.font;
    expect(serifWeight('heading')).toBe(String(v2.roles.heading.weight));
    expect(serifWeight('regular')).toBe(String(weights.regular));
    expect(serifWeight('semibold')).toBe(String(weights.medium));
  });

  it('uses the --font-v2 var for the family', () => {
    expect(webFontFamily).toBe('var(--font-v2)');
  });
});

describe('one serif for all text', () => {
  it('Body, Eyebrow and Button labels use the serif family once it is ready', () => {
    renderAll(true);
    for (const text of ['Eyebrow text', 'Body text', 'Go']) {
      expect(family(text)).toContain('var(--font-v2)');
    }
  });

  describe('on native', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows the system font until the serif is ready, then the registered faces', () => {
      vi.spyOn(Platform, 'OS', 'get').mockReturnValue('ios');
      const { unmount } = render(
        <SerifReadyContext.Provider value={false}>
          <Body>Body text</Body>
        </SerifReadyContext.Provider>,
      );
      expect(family('Body text')).not.toContain(fonts.serifRegular);
      unmount();
      renderAll(true);
      expect(family('Body text')).toContain(fonts.serifRegular);
      expect(family('Go')).toContain(fonts.serifSemiBold);
    });
  });
});
