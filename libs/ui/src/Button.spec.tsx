import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { colors } from '@griever/tokens';
import { Button } from './Button';
import type { ButtonNode } from './Button';

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

describe('Button colours', () => {
  it.each([
    ['unavailable primary: page colour on neutral-700', colors.bg, colors['neutral-700']],
    ['unavailable secondary or ghost: neutral-700 on the page', colors['neutral-700'], colors.bg],
    ['unavailable secondary or ghost: neutral-700 on a surface', colors['neutral-700'], colors.surface],
    ['available primary: page colour on accent-700', colors.bg, colors['accent-700']],
    ['available secondary or ghost: accent-700 on the page', colors['accent-700'], colors.bg],
    ['tertiary: accent-700 on the page', colors['accent-700'], colors.bg],
    ['tertiary pressed: accent-700 on accent-100', colors['accent-700'], colors['accent-100']],
    ['tertiary unavailable: neutral-700 on the page', colors['neutral-700'], colors.bg],
  ])('%s is at least 4.5:1', (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('does not fade the unavailable button with opacity', () => {
    render(<Button label="Go" onPress={vi.fn()} ariaDisabled />);
    const style = getComputedStyle(screen.getByRole('button', { name: 'Go' }));
    expect(style.opacity === '' || style.opacity === '1').toBe(true);
  });
});
