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

  it('shows Open Service for a service item and calls onOpenService', async () => {
    const onOpenService = vi.fn();
    render(
      <ChecklistItemDetail itemId="set-service" state={null} onSetState={noop} onBack={noop} onOpenService={onOpenService} />,
    );
    await userEvent.click(screen.getByRole('button', { name: copy.openService }));
    expect(onOpenService).toHaveBeenCalledTimes(1);
  });

  it('shows no Open Service for an item without a section, or without the prop', () => {
    const view = render(
      <ChecklistItemDetail itemId="write-obituary" state={null} onSetState={noop} onBack={noop} onOpenService={noop} />,
    );
    expect(screen.queryByRole('button', { name: copy.openService })).toBeNull();
    view.unmount();
    render(<ChecklistItemDetail itemId="set-service" state={null} onSetState={noop} onBack={noop} />);
    expect(screen.queryByRole('button', { name: copy.openService })).toBeNull();
  });

  it('styles Back as a ghost button with a hidden icon, keeping its name', () => {
    render(<ChecklistItemDetail itemId="custody" state={null} onSetState={noop} onBack={noop} />);
    const back = screen.getByRole('button', { name: copy.back });
    expect(back.className).toContain('gg-btn-ghost');
    expect(back.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('orders Back, then the toggles, then the guidance panel, then Open Service', () => {
    render(
      <ChecklistItemDetail itemId="set-service" state={null} onSetState={noop} onBack={noop} onOpenService={noop} />,
    );
    const back = screen.getByRole('button', { name: copy.back });
    const done = screen.getByRole('button', { name: copy.done });
    const heading = screen.getAllByRole('heading', { level: 2 })[0];
    const open = screen.getByRole('button', { name: copy.openService });
    const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(back, done)).toBe(true);
    expect(before(done, heading)).toBe(true);
    expect(before(heading, open)).toBe(true);
  });

  it('puts all guidance parts in one panel, with a divider between parts only', () => {
    render(<ChecklistItemDetail itemId="pronouncement" state={null} onSetState={noop} onBack={noop} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    const panel = headings[0].closest('.gg-panel');
    expect(panel).not.toBeNull();
    headings.forEach((h) => expect(h.closest('.gg-panel')).toBe(panel));
    const sections = headings.map((h) => h.closest('section') as HTMLElement);
    expect(sections[0].className).not.toContain('border-t');
    sections.slice(1).forEach((s) => expect(s.className).toContain('border-[var(--color-divider)]'));
  });
});
