import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { checklistDetail, findHardCodedCopy, screenCopy } from '@griever/copy';
import { ChecklistItemDetail } from './ChecklistItemDetail';

const copy = screenCopy('cmsChecklist');
const noop = () => undefined;

describe('ChecklistItemDetail', () => {
  it('renders every part as an h2 and no h1', () => {
    const detail = checklistDetail('pronouncement');
    render(<ChecklistItemDetail itemId="pronouncement" state={null} onSetState={noop} onBack={noop} />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: copy.whatItIs })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: copy.whyItMatters })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: copy.whoToCall })).toBeTruthy();
    expect(screen.getByText(detail?.whatItIs ?? '')).toBeTruthy();
    expect(screen.queryByText(copy.comingSoon)).toBeNull();
  });

  it('leaves out empty parts and shows no source links', () => {
    const detail = checklistDetail('pronouncement');
    expect(detail?.whatToBring).toBeUndefined();
    render(<ChecklistItemDetail itemId="pronouncement" state={null} onSetState={noop} onBack={noop} />);
    expect(screen.queryByRole('heading', { name: copy.whatToBring })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the coming note when an item has no entry', () => {
    render(
      <ChecklistItemDetail itemId={'no-such-item' as never} state={null} onSetState={noop} onBack={noop} />,
    );
    expect(screen.getByText(copy.comingSoon)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  });

  it('calls onSetState from the toggles', async () => {
    const onSetState = vi.fn();
    render(<ChecklistItemDetail itemId="custody" state={null} onSetState={onSetState} onBack={noop} />);
    await userEvent.click(screen.getByRole('button', { name: copy.done }));
    expect(onSetState).toHaveBeenCalledWith('done');
  });

  it('clears a pressed state', async () => {
    const onSetState = vi.fn();
    render(<ChecklistItemDetail itemId="custody" state="done" onSetState={onSetState} onBack={noop} />);
    await userEvent.click(screen.getByRole('button', { name: copy.done }));
    expect(onSetState).toHaveBeenCalledWith(null);
  });

  it('calls onBack from the Back button', async () => {
    const onBack = vi.fn();
    render(<ChecklistItemDetail itemId="custody" state={null} onSetState={noop} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: copy.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'ChecklistItemDetail.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
