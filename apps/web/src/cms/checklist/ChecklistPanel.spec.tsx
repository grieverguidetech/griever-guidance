import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import { findHardCodedCopy, screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES } from '@griever/shared';
import { ChecklistPanel } from './ChecklistPanel';

const copy = screenCopy('cmsChecklist');
const noop = () => undefined;

describe('ChecklistPanel', () => {
  afterEach(async () => {
    cleanup();
    await accountStore.setChecklistTicks([]);
  });

  it('shows the parts in order', () => {
    const { container } = render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const text = container.textContent ?? '';
    const order = [
      copy.intro,
      'Certified death certificates',
      copy.phases['right-away'],
      copy.phases['first-months'],
      'Gather when you can',
      'Life insurance policies',
      "We won't remind you about this list.",
    ].map((part) => text.indexOf(part));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('as a preview: every phase and item, no ticks, the keep-ticks line, and items still open', async () => {
    const onOpenItem = vi.fn();
    const { container } = render(<ChecklistPanel preview="owner" checklist={{}} onSetItem={noop} onOpenItem={onOpenItem} />);
    expect(screen.getByText(copy.previewLine)).toBeInTheDocument();
    for (const phase of CHECKLIST_PHASES) {
      expect(screen.getByRole('button', { name: copy.phases[phase.key] })).toBeInTheDocument();
    }
    expect(container.querySelector('[aria-pressed]')).toBeNull();
    expect(screen.queryByText('Gather when you can')).toBeNull();
    const first = container.querySelector<HTMLElement>('[data-checklist-item]');
    await userEvent.setup().click(first as HTMLElement);
    expect(onOpenItem).toHaveBeenCalledTimes(1);
  });

  it('holds the intro and the certificate card in one panel', () => {
    const { container } = render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const panels = container.querySelectorAll('.gg-panel');
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveTextContent(copy.intro);
    expect(
      within(panels[0] as HTMLElement).getByRole('heading', { level: 3, name: 'Certified death certificates' }),
    ).toBeInTheDocument();
  });

  it('row buttons opt out of the ghost underline', () => {
    const { container } = render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const row = container.querySelector('[data-checklist-item]');
    expect(row).toHaveClass('gg-btn-ghost', 'gg-btn-ghost-plain');
  });

  it('keeps device ticks in the account store', async () => {
    const user = userEvent.setup();
    render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    await user.click(within(screen.getByRole('heading', { level: 3, name: 'Gather when you can' })).getByRole('button'));
    const row = screen.getByRole('button', { name: /Life insurance policies/ });
    await waitFor(() => expect(row).toBeEnabled());
    await user.click(row);
    await waitFor(async () => expect(await accountStore.getChecklistTicks()).toEqual(['life-insurance']));
  });

  it('reports a phase item state change and an open', async () => {
    const user = userEvent.setup();
    const onSetItem = vi.fn();
    const onOpenItem = vi.fn();
    render(<ChecklistPanel checklist={{}} onSetItem={onSetItem} onOpenItem={onOpenItem} />);
    const group = screen.getByRole('group', { name: copy.items.pronouncement });
    await user.click(within(group).getByRole('button', { name: copy.done }));
    expect(onSetItem).toHaveBeenCalledWith('pronouncement', 'done');
    await user.click(screen.getByRole('button', { name: copy.items.custody }));
    expect(onOpenItem).toHaveBeenCalledWith('custody');
  });

  it('has h3 headings: the card, the six phases, and Gather', () => {
    render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual([
      'Certified death certificates',
      ...CHECKLIST_PHASES.map((p) => copy.phases[p.key]),
      'Gather when you can',
    ]);
    expect(CHECKLIST_PHASES).toHaveLength(6);
  });

  it('has no h1, no heading above h3, and no counts', () => {
    const { container } = render(<ChecklistPanel checklist={{ pronouncement: 'done' }} onSetItem={noop} onOpenItem={noop} />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(container.textContent).not.toMatch(/\d+\s*of\s*\d+/);
    expect(container.textContent).not.toMatch(/%/);
  });

  it('holds no hard-coded copy that belongs to the checklist screen', () => {
    const source = readFileSync(join(import.meta.dirname, 'ChecklistPanel.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });

  it('lists the phases in the agreed order with the new names, Gather last', () => {
    render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names.slice(1)).toEqual([
      'Right away (first 24 to 48 hours)',
      'Within the first few days',
      'Obituary checklist',
      'Planning the service checklist',
      'Within the first few weeks',
      'Within the first few months',
      'Gather when you can',
    ]);
  });

  it('opens and closes Gather from the keyboard, closed to start', async () => {
    const user = userEvent.setup();
    render(<ChecklistPanel checklist={{}} onSetItem={noop} onOpenItem={noop} />);
    const button = within(screen.getByRole('heading', { level: 3, name: 'Gather when you can' })).getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Life insurance policies/ })).toBeNull();
    button.focus();
    await user.keyboard('{Enter}');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Life insurance policies/ })).toBeVisible();
    await user.keyboard(' ');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /Life insurance policies/ })).toBeNull();
  });
});
