import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { PaywallPlaceholder } from './PaywallPlaceholder';

describe('PaywallPlaceholder (#292)', () => {
  it('is a labelled modal dialog with the heading, one line and a Close button', () => {
    render(<PaywallPlaceholder onClose={vi.fn()} returnFocusRef={createRef()} />);
    const dialog = screen.getByRole('dialog', { name: 'The full plan' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('!');
  });

  it('moves focus into the dialog', () => {
    render(<PaywallPlaceholder onClose={vi.fn()} returnFocusRef={createRef()} />);
    expect(screen.getByRole('heading', { name: 'The full plan' })).toBe(document.activeElement);
  });

  it('closes with Close and with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaywallPlaceholder onClose={onClose} returnFocusRef={createRef()} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
