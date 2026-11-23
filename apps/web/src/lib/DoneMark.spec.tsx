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

describe('DoneMark turn (#1004)', () => {
  it('does not turn a row that renders already ticked', () => {
    render(<DoneMark checked />);
    expect(screen.getByTestId('done-mark-swirl')).not.toHaveClass('gg-done-mark-turn');
  });

  it('turns when the row goes from open to ticked, and keeps the class on a re-render with no change', () => {
    const { rerender } = render(<DoneMark checked={false} />);
    rerender(<DoneMark checked />);
    expect(screen.getByTestId('done-mark-swirl')).toHaveClass('gg-done-mark-turn');
    rerender(<DoneMark checked />);
    expect(screen.getByTestId('done-mark-swirl')).toHaveClass('gg-done-mark-turn');
  });

  it('does not turn a ticked row that re-renders, and turns again after untick and tick', () => {
    const { rerender } = render(<DoneMark checked />);
    rerender(<DoneMark checked className="x" />);
    expect(screen.getByTestId('done-mark-swirl')).not.toHaveClass('gg-done-mark-turn');
    rerender(<DoneMark checked={false} />);
    rerender(<DoneMark checked />);
    expect(screen.getByTestId('done-mark-swirl')).toHaveClass('gg-done-mark-turn');
  });

  it('puts an extra class on the wrapper', () => {
    render(<DoneMark checked={false} className="extra" />);
    expect(screen.getByTestId('done-mark')).toHaveClass('gg-done-mark', 'extra');
  });
});
