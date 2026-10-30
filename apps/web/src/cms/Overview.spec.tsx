import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { CHECKLIST_PHASES } from '@griever/shared';
import type { ChecklistFields, SectionFields } from '@griever/shared';
import { screenCopy } from '@griever/copy';
import { Overview } from './Overview';

const shell = screenCopy('cmsShell');
const CHECKLIST_ITEM_LABEL = 'Get a legal pronouncement of death';
const allIds = CHECKLIST_PHASES.flatMap((phase) => [...phase.itemIds]);
const allDone: ChecklistFields = { checklist: Object.fromEntries(allIds.map((id) => [id, 'done'])) };

function setup(session: Pick<SectionFields, 'sectionStatus'> = {}, checklist: ChecklistFields = {}) {
  const onOpen = vi.fn();
  const onOpenItem = vi.fn();
  const view = render(<Overview session={session} checklist={checklist} onOpen={onOpen} onOpenItem={onOpenItem} />);
  return { onOpen, onOpenItem, ...view };
}

describe('Overview', () => {
  it('an empty session points Next at The person and opens it', async () => {
    const { onOpen } = setup();
    const next = screen.getByRole('button', { name: 'Next: The person' });
    await userEvent.click(next);
    expect(onOpen).toHaveBeenCalledWith('person');
  });

  it('person ready moves Next to Service', async () => {
    const { onOpen } = setup({ sectionStatus: { person: 'ready' } });
    await userEvent.click(screen.getByRole('button', { name: 'Next: Service' }));
    expect(onOpen).toHaveBeenCalledWith('service');
  });

  it('shows no Next when both open sections are ready', () => {
    setup({ sectionStatus: { person: 'ready', service: 'ready' } });
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });

  it('lists the 5 sections in order and every status word', () => {
    setup({ sectionStatus: { person: 'ready', service: 'in_progress' } });
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toHaveLength(5);
    expect(rows).toEqual([
      'The person Ready',
      `Announcement ${shell.comingLater}`,
      'Service In progress',
      `Obituary ${shell.comingLater}`,
      `Thank-yous ${shell.comingLater}`,
    ]);
  });

  it('shows Not started for an untouched open section', () => {
    setup();
    expect(screen.getAllByText('Not started')).toHaveLength(2);
  });

  it('later sections show the coming-later note as plain text, not buttons', () => {
    setup();
    expect(screen.getAllByText('This part comes later. Nothing is needed here yet.')).toHaveLength(3);
    for (const name of ['Announcement', 'Obituary', 'Thank-yous']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${name}`) })).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: /^(The person|Service)/ })).toHaveLength(2);
  });

  it('a row calls onOpen with its key', async () => {
    const { onOpen } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Service/ }));
    expect(onOpen).toHaveBeenCalledWith('service');
  });

  it('shows the current phase and the next item, and the item calls onOpenItem', async () => {
    const { onOpenItem } = setup();
    expect(screen.getByRole('heading', { level: 2, name: 'Now: Right away (first 24 to 48 hours)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: `On the checklist: ${CHECKLIST_ITEM_LABEL}` }));
    expect(onOpenItem).toHaveBeenCalledWith(CHECKLIST_PHASES[0].itemIds[0]);
  });

  it('without onOpenItem the phase shows and the next-item button does not', () => {
    render(<Overview session={{}} checklist={{}} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Now: Right away (first 24 to 48 hours)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^On the checklist:/ })).toBeNull();
  });

  it('shows nothing from the checklist when every phase is done', () => {
    setup({}, allDone);
    expect(screen.queryByText(/^Now:/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^On the checklist:/ })).toBeNull();
  });

  it('a Ready section shows an aria-hidden check beside its status text', () => {
    const { container } = setup({ sectionStatus: { person: 'ready' } });
    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true');
    expect(icons[0]).toHaveClass('text-[color:var(--color-success-700)]');
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('shows no check when nothing is ready', () => {
    const { container } = setup();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('has no counts, percentages or h1', () => {
    const { container } = setup({ sectionStatus: { person: 'ready' } });
    expect(container.textContent).not.toMatch(/\d+ of \d+/);
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'Overview.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
    expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
  });
});
