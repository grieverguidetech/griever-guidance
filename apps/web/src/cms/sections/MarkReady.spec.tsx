import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkReady } from './MarkReady';

describe('MarkReady', () => {
  it('is a toggle button that is not pressed when not ready', () => {
    render(<MarkReady ready={false} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('is pressed when ready', () => {
    render(<MarkReady ready onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks for the opposite state on click', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<MarkReady ready={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<MarkReady ready onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('works from the keyboard', async () => {
    const onChange = vi.fn();
    render(<MarkReady ready={false} onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
