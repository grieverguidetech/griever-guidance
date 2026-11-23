import { render, screen } from '@testing-library/react';
import { screenCopy } from '@griever/copy';
import { ChecklistItemRow } from './ChecklistItemRow';

const copy = screenCopy('cmsChecklist');
const noop = () => undefined;

function renderRow(state: 'open' | 'done' | 'not_applicable') {
  return render(
    <ul>
      <ChecklistItemRow id="pronouncement" state={state} onOpen={noop} onChange={noop} />
    </ul>,
  );
}

describe('ChecklistItemRow done mark (#1004)', () => {
  it('shows the swirl on a done row, keeps aria-pressed and a 44px target, and hides the mark', () => {
    renderRow('done');
    const done = screen.getByRole('button', { name: copy.done });
    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(done).toHaveClass('size-11');
    expect(screen.getByTestId('done-mark')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('done-mark-swirl')).toBeInTheDocument();
    expect(screen.queryByTestId('done-mark-ring')).toBeNull();
  });

  it('shows the ring on an open row', () => {
    renderRow('open');
    expect(screen.getByRole('button', { name: copy.done })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('done-mark-ring')).toBeInTheDocument();
    expect(screen.queryByTestId('done-mark-swirl')).toBeNull();
  });

  it('shows a not applicable row as done, with the swirl', () => {
    renderRow('not_applicable');
    expect(screen.getByTestId('done-mark-swirl')).toBeInTheDocument();
  });

  it('draws no mark on a read-only preview row', () => {
    render(
      <ul>
        <ChecklistItemRow id="pronouncement" state="open" onOpen={noop} onChange={noop} readOnly />
      </ul>,
    );
    expect(screen.queryByTestId('done-mark')).toBeNull();
  });
});
