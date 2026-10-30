import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
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

  it('shows the hint and ties it to the toggle', () => {
    render(<MarkReady ready={false} onChange={() => undefined} />);
    const hint = screen.getByText('Mark as ready when these details are settled. You can still change them.');
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAccessibleDescription(hint.textContent ?? '');
  });

  it('shows no continue button when not ready', () => {
    render(<MarkReady ready={false} onChange={() => undefined} nextSection="service" onNext={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Next:|Back to Overview/ })).toBeNull();
  });

  it('shows "Next: section" when ready and calls onNext', async () => {
    const onNext = vi.fn();
    render(<MarkReady ready onChange={() => undefined} nextSection="service" onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next: Service' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('shows "Back to Overview" when ready and nothing is left', async () => {
    const onNext = vi.fn();
    render(<MarkReady ready onChange={() => undefined} nextSection={null} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('uses the chip and hint styles, and the next button enters calmly', () => {
    render(<MarkReady ready onChange={() => undefined} nextSection="service" onNext={() => undefined} />);
    const toggle = screen.getByRole('button', { name: 'Mark as ready' });
    expect(toggle).toHaveClass('gg-chip');
    expect(screen.getByText(/Mark as ready when/)).toHaveClass('gg-hint');
    expect(screen.getByRole('button', { name: 'Next: Service' })).toHaveClass('gg-enter');
  });

  it('keeps focus on the toggle after it is pressed', async () => {
    const Harness = () => {
      const [ready, setReady] = useState(false);
      return <MarkReady ready={ready} onChange={setReady} nextSection="service" onNext={() => undefined} />;
    };
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Mark as ready' });
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Next: Service' })).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'MarkReady.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });
});
