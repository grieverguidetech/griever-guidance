import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { v2 } from '@griever/tokens';
import { Button } from './Button';
import type { ButtonNode } from './Button';

const page = v2.roles.page.color;

describe('Button', () => {
  it('is a button with its label as the name, and calls onPress', async () => {
    const onPress = vi.fn();
    render(<Button label="Start" onPress={onPress} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('stays focusable and pressable on web when busy (busy is a native accessibility state)', async () => {
    const onPress = vi.fn();
    render(<Button label="Save" onPress={onPress} busy />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).not.toBeDisabled();
    await userEvent.tab();
    expect(button).toHaveFocus();
  });

  it('is a real button element', () => {
    render(<Button label="Start" onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start' }).tagName).toBe('BUTTON');
  });

  it('is reachable and pressable from the keyboard', async () => {
    const onPress = vi.fn();
    render(<Button label="Start" onPress={onPress} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Start' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not marked unavailable by default', () => {
    render(<Button label="Start" onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start' })).not.toHaveAttribute('aria-disabled');
  });

  describe('when aria-disabled', () => {
    it('reads as disabled but stays focusable', async () => {
      render(<Button label="Share the service" onPress={vi.fn()} ariaDisabled />);
      const button = screen.getByRole('button', { name: 'Share the service' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      await userEvent.tab();
      expect(button).toHaveFocus();
    });

    it('still calls onPress, so the caller can show the paywall placeholder', async () => {
      const onPress = vi.fn();
      render(<Button label="Share the service" onPress={onPress} ariaDisabled />);
      await userEvent.click(screen.getByRole('button', { name: 'Share the service' }));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('drops aria-disabled when it is no longer unavailable', () => {
      const { rerender } = render(<Button label="Go" onPress={vi.fn()} ariaDisabled />);
      expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('aria-disabled', 'true');
      rerender(<Button label="Go" onPress={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute('aria-disabled');
    });

    it('can be described by the element that explains why', () => {
      render(
        <>
          <Button label="Share the service" onPress={vi.fn()} ariaDisabled describedBy="why" />
          <p id="why">Opens after you set the date.</p>
        </>,
      );
      expect(screen.getByRole('button', { name: 'Share the service' })).toHaveAccessibleDescription(
        'Opens after you set the date.',
      );
    });
  });

  it('keeps aria-disabled when the button is remounted', () => {
    const { rerender } = render(<Button key="a" label="Go" onPress={vi.fn()} ariaDisabled />);
    rerender(<Button key="b" label="Go" onPress={vi.fn()} ariaDisabled />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps aria-disabled when other props change', () => {
    const { rerender } = render(<Button label="Go" onPress={vi.fn()} ariaDisabled />);
    rerender(<Button label="Go again" onPress={vi.fn()} ariaDisabled variant="secondary" />);
    expect(screen.getByRole('button', { name: 'Go again' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('says it opens a dialog', () => {
    render(<Button label="What you'll need" onPress={vi.fn()} opensDialog />);
    expect(screen.getByRole('button', { name: "What you'll need" })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('gives the caller the button node for focus return', () => {
    let node: ButtonNode | null = null;
    function Host() {
      const ref = useRef<ButtonNode | null>(null);
      return (
        <Button
          label="Back"
          onPress={() => ref.current && (node = ref.current)}
          buttonRef={ref}
        />
      );
    }
    render(<Host />);
    screen.getByRole('button', { name: 'Back' }).click();
    expect((node as unknown as HTMLElement).tagName).toBe('BUTTON');
  });

  it('is at least 44 pixels in each direction', () => {
    render(<Button label="Go" onPress={vi.fn()} />);
    const style = getComputedStyle(screen.getByRole('button', { name: 'Go' }));
    expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(style.minWidth, 10)).toBeGreaterThanOrEqual(44);
  });
});

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

describe('tertiary Button', () => {
  it('is a real button with its label as the name', async () => {
    const onPress = vi.fn();
    render(<Button label="Back" variant="tertiary" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Back' });
    expect(button.tagName).toBe('BUTTON');
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has no fill and no border, and a 44px target', () => {
    render(<Button label="Back" variant="tertiary" onPress={vi.fn()} />);
    const style = getComputedStyle(screen.getByRole('button', { name: 'Back' }));
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(style.backgroundColor);
    expect(style.borderTopColor).toBe('rgba(0, 0, 0, 0.00)');
    expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(style.minWidth, 10)).toBeGreaterThanOrEqual(44);
  });

  it('is not only colour: the label is underlined', () => {
    render(<Button label="Back" variant="tertiary" onPress={vi.fn()} />);
    const label = screen.getByText('Back');
    expect(getComputedStyle(label).textDecoration).toContain('underline');
  });
});

describe('header Button (Back, What you\'ll need)', () => {
  it('has a page-coloured (transparent) fill, a thin accent outline, a 44px target and no underline', () => {
    render(<Button label="What you'll need" variant="header" onPress={vi.fn()} />);
    const style = getComputedStyle(screen.getByRole('button', { name: "What you'll need" }));
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(style.backgroundColor);
    expect(style.borderTopColor).toBe('rgba(79, 134, 173, 1.00)');
    expect(style.borderTopWidth).toBe('1px');
    expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(screen.getByText("What you'll need")).textDecoration).not.toContain('underline');
  });
});

describe('Button colours', () => {
  it.each([
    ['unavailable primary: page colour on muted', page, v2.roles.muted],
    ['unavailable secondary or ghost: muted on the page', v2.roles.muted, page],
    ['unavailable secondary or ghost: muted on a field fill', v2.roles.muted, v2.recipes.field.fill],
    ['available primary: page colour on link', page, v2.roles.link],
    ['available secondary or ghost: link on the page', v2.roles.link, page],
    ['header: the focus outline on the page (non-text, 3:1)', v2.roles.focus, page, 3],
    ['tertiary: link on the page', v2.roles.link, page],
    ['tertiary pressed: link on wash', v2.roles.link, v2.roles.wash],
    ['tertiary unavailable: muted on the page', v2.roles.muted, page],
  ])('%s is at least its minimum ratio', (_name, foreground, background, minimum = 4.5) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(minimum);
  });

  it('does not fade the unavailable button with opacity', () => {
    render(<Button label="Go" onPress={vi.fn()} ariaDisabled />);
    const style = getComputedStyle(screen.getByRole('button', { name: 'Go' }));
    expect(style.opacity === '' || style.opacity === '1').toBe(true);
  });
});

describe('Button swirl hook on web', () => {
  const variants = ['primary', 'secondary', 'tinted', 'ghost', 'tertiary', 'header'] as const;

  it.each(['primary', 'secondary'] as const)('puts data-gg-btn="%s" on the DOM node (react-native-web turns dataSet into data-*)', (variant) => {
    render(<Button label="Go" onPress={vi.fn()} variant={variant} />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('data-gg-btn', variant);
  });

  it('is the default variant, so a plain button carries the primary hook', () => {
    render(<Button label="Go" onPress={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('data-gg-btn', 'primary');
  });

  it.each(variants.filter((v) => v !== 'primary' && v !== 'secondary'))('has no hook on the %s variant', (variant) => {
    render(<Button label="Go" onPress={vi.fn()} variant={variant} />);
    expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute('data-gg-btn');
  });

  it('drops the v1 fill on a swirl button, and keeps the tinted fill on the others', () => {
    const { unmount } = render(<Button label="Go" onPress={vi.fn()} variant="primary" ariaDisabled />);
    const swirl = getComputedStyle(screen.getByRole('button', { name: 'Go' }));
    // jsdom reports rgb(), so assert the empty or transparent fill rather than comparing to hex tokens.
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(swirl.backgroundColor);
    unmount();
    render(<Button label="Go" onPress={vi.fn()} variant="tinted" />);
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).not.toContain(getComputedStyle(screen.getByRole('button', { name: 'Go' })).backgroundColor);
  });

  it('lets the label inherit the swirl text colour instead of the v1 page-colour label', () => {
    render(<Button label="Go" onPress={vi.fn()} variant="primary" />);
    const label = getComputedStyle(screen.getByText('Go'));
    expect(label.color).toBe(getComputedStyle(screen.getByRole('button', { name: 'Go' })).color);
    expect(label.color).not.toBe('rgb(248, 247, 244)');
    expect(label.color).not.toBe('rgb(0, 103, 134)');
    expect(label.fontFamily).toBe('inherit');
    expect(label.fontWeight).toBe('inherit');
    expect(['inherit', '']).toContain(label.fontSize);
  });

  it('keeps aria-disabled, focus and onPress on a swirl button that is unavailable', async () => {
    const onPress = vi.fn();
    render(<Button label="Go" onPress={onPress} variant="secondary" ariaDisabled />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('data-gg-btn', 'secondary');
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
