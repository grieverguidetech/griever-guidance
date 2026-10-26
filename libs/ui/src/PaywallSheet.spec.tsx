import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useRef, useState } from 'react';
import { PaywallSheet } from './PaywallSheet';

const copy = { heading: 'The full plan', line: 'Payment details will go here.', close: 'Close' };

describe('PaywallSheet (#292, #341)', () => {
  it('is a labelled modal dialog with the heading, one line and a Close button', () => {
    render(<PaywallSheet copy={copy} onClose={vi.fn()} returnFocusRef={createRef()} />);
    const dialog = screen.getByRole('dialog', { name: 'The full plan' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(dialog.textContent).not.toContain('!');
  });

  it('draws nothing while not visible', () => {
    render(<PaywallSheet copy={copy} visible={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves focus to the heading', () => {
    render(<PaywallSheet copy={copy} onClose={vi.fn()} returnFocusRef={createRef()} />);
    expect(screen.getByRole('heading', { name: 'The full plan' })).toHaveFocus();
  });

  it('closes with Close and with Escape', async () => {
    const onClose = vi.fn();
    render(<PaywallSheet copy={copy} onClose={onClose} returnFocusRef={createRef()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog', async () => {
    render(<PaywallSheet copy={copy} onClose={vi.fn()} returnFocusRef={createRef()} />);
    const close = screen.getByRole('button', { name: 'Close' });
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('puts focus back on the row that opened it', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      const row = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={row} onClick={() => setOpen(true)}>
            Share the service
          </button>
          {open && <PaywallSheet copy={copy} onClose={() => setOpen(false)} returnFocusRef={row} />}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Share the service' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });
});
