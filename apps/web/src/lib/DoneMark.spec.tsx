import { render, screen } from '@testing-library/react';
import { DoneMark } from './DoneMark';

describe('DoneMark (#1004)', () => {
  it('shows the swirl, and no ring, when checked', () => {
    render(<DoneMark checked />);
    expect(screen.getByTestId('done-mark-swirl')).toHaveClass('gg-done-mark-swirl');
    expect(screen.queryByTestId('done-mark-ring')).toBeNull();
  });

  it('shows the ring, and no swirl, when open', () => {
    render(<DoneMark checked={false} />);
    expect(screen.getByTestId('done-mark-ring')).toHaveClass('gg-done-mark-ring');
    expect(screen.queryByTestId('done-mark-swirl')).toBeNull();
  });

  it.each([true, false])('is hidden from screen readers (checked %s)', (checked) => {
    render(<DoneMark checked={checked} />);
    expect(screen.getByTestId('done-mark')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('done-mark')).toHaveClass('gg-done-mark');
  });
});
