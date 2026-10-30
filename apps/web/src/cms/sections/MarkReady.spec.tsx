import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
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

  it('shows a check mark only when ready, and keeps the name', () => {
    const { container, rerender } = render(<MarkReady ready={false} onChange={() => undefined} />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<MarkReady ready onChange={() => undefined} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toBeInTheDocument();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'MarkReady.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
