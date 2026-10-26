import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import type { ButtonNode } from './Button';

describe('Button', () => {
  it('is a button with its label as the name, and calls onPress', async () => {
    const onPress = vi.fn();
    render(<Button label="Start" onPress={onPress} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onPress).toHaveBeenCalledTimes(1);
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
