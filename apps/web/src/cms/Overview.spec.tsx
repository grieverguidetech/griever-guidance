import type { ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { CHECKLIST_PHASES } from '@griever/shared';
import type { ChecklistFields } from '@griever/shared';
import { screenCopy } from '@griever/copy';
import { Overview } from './Overview';

const shell = screenCopy('cmsShell');
const CHECKLIST_ITEM_LABEL = 'Get a legal pronouncement of death';
const allIds = CHECKLIST_PHASES.flatMap((phase) => [...phase.itemIds]);
const allDone: ChecklistFields = { checklist: Object.fromEntries(allIds.map((id) => [id, 'done'])) };

function setup(session: ComponentProps<typeof Overview>['session'] = {}, checklist: ChecklistFields = {}) {
  const onOpen = vi.fn();
  const onOpenItem = vi.fn();
  const view = render(<Overview session={session} checklist={checklist} onOpen={onOpen} onOpenItem={onOpenItem} />);
  return { onOpen, onOpenItem, ...view };
}

describe('Overview', () => {
  it('an empty session marks The person as the next card and opens it', async () => {
    const { onOpen } = setup();
    const card = screen.getByRole('button', { name: 'The person Not started Start with their name Continue' });
    expect(card).toHaveClass('gg-panel');
    expect(card.className).toContain('--color-accent-700');
    await userEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('person');
  });

  it('person ready moves the Continue card to Announcement', async () => {
    const { onOpen } = setup({ sectionStatus: { person: 'ready' } });
    expect(screen.getByRole('button', { name: /^The person Ready/ })).not.toHaveTextContent('Continue');
    await userEvent.click(screen.getByRole('button', { name: /^Announcement Not started .*Continue$/ }));
    expect(onOpen).toHaveBeenCalledWith('announcement');
  });

  it('shows no Continue and no separate Next button when every section is ready', () => {
    setup({
      sectionStatus: { person: 'ready', announcement: 'ready', service: 'ready', obituary: 'ready', thanks: 'ready' },
    });
    expect(screen.queryByText('Continue')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });

  it('never renders the old Next: primary button', () => {
    setup();
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });

  it('lists the 5 sections in order with status and summary', () => {
    setup({
      sectionStatus: { person: 'ready', service: 'in_progress' },
      personName: 'Margaret Hayes',
      dateOfPassing: '2026-05-29',
      serviceType: 'Funeral',
      serviceDate: '2026-06-03',
      servicePlace: 'St. Mark Church',
    });
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toHaveLength(5);
    expect(rows).toEqual([
      'The person Ready Margaret Hayes · passed May 29, 2026',
      `Announcement Not started ${shell.summaryAnnouncementEmpty} Continue`,
      'Service In progress Funeral, June 3, 2026 at St. Mark Church',
      `Obituary Not started ${shell.summaryObituaryEmpty}`,
      `Thank-yous Not started ${shell.summaryThanksEmpty}`,
    ]);
  });

  it('person summary omits missing parts', () => {
    const { unmount } = setup({ personName: 'Margaret Hayes' });
    expect(screen.getByRole('button', { name: /^The person/ })).toHaveTextContent('Margaret Hayes');
    expect(screen.getByRole('button', { name: /^The person/ })).not.toHaveTextContent('passed');
    unmount();
    setup({ dateOfPassing: '2026-05-29' });
    expect(screen.getByRole('button', { name: /^The person/ })).toHaveTextContent('The person Not started passed May 29, 2026');
  });

  it('service summary falls back to "Service" and omits missing parts', () => {
    const { unmount } = setup({ serviceDate: '2026-06-03' });
    expect(screen.getByRole('button', { name: /^Service/ })).toHaveTextContent('Service, June 3, 2026');
    unmount();
    setup({ servicePlace: 'St. Mark Church' });
    expect(screen.getByRole('button', { name: /^Service/ })).toHaveTextContent('Service at St. Mark Church');
  });

  it('an empty service shows a calm prompt', () => {
    setup();
    expect(screen.getByRole('button', { name: /^Service/ })).toHaveTextContent('Add the date and place');
  });

  it('shows Not started for every untouched section', () => {
    setup();
    expect(screen.getAllByText('Not started')).toHaveLength(5);
  });

  it('every section is a button and none shows the coming-later note', () => {
    setup();
    expect(screen.queryByText(shell.comingLater)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^(The person|Announcement|Service|Obituary|Thank-yous)/ })).toHaveLength(5);
  });

  it('announcement summary is the first line of the message, cut short when long', () => {
    const { unmount } = setup({ announcementMessage: '\n  Margaret passed away peacefully.\nSecond line' });
    expect(screen.getByRole('button', { name: /^Announcement/ })).toHaveTextContent('Margaret passed away peacefully.');
    expect(screen.getByRole('button', { name: /^Announcement/ })).not.toHaveTextContent('Second line');
    unmount();
    setup({ announcementMessage: 'x'.repeat(200) });
    expect(screen.getByRole('button', { name: /^Announcement/ })).toHaveTextContent(`${'x'.repeat(80)}…`);
  });

  it('obituary summary: template, draft started, then the publisher', () => {
    const { unmount } = setup();
    expect(screen.getByRole('button', { name: /^Obituary/ })).toHaveTextContent('Start from the template');
    unmount();
    const second = setup({ obituaryCity: 'Austin' });
    expect(screen.getByRole('button', { name: /^Obituary/ })).toHaveTextContent('Draft started');
    second.unmount();
    setup({ obituaryText: 'Text', obituaryPublisher: 'The Daily News' });
    expect(screen.getByRole('button', { name: /^Obituary/ })).toHaveTextContent('Published in The Daily News');
  });

  it('thank-yous summary: template, then draft started once the message is edited', () => {
    const { unmount } = setup();
    expect(screen.getByRole('button', { name: /^Thank-yous/ })).toHaveTextContent('Start from the template');
    unmount();
    setup({ thanksMessage: 'Thank you all.' });
    expect(screen.getByRole('button', { name: /^Thank-yous/ })).toHaveTextContent('Draft started');
  });

  it('a row calls onOpen with its key', async () => {
    const { onOpen } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^Service/ }));
    expect(onOpen).toHaveBeenCalledWith('service');
  });

  it('shows the current phase and the next item in one card that calls onOpenItem', async () => {
    const { onOpenItem } = setup();
    await userEvent.click(
      screen.getByRole('button', {
        name: `Now: Right away (first 24 to 48 hours) On the checklist: ${CHECKLIST_ITEM_LABEL}`,
      }),
    );
    expect(onOpenItem).toHaveBeenCalledWith(CHECKLIST_PHASES[0].itemIds[0]);
  });

  it('without onOpenItem the phase shows and the next-item button does not', () => {
    render(<Overview session={{}} checklist={{}} onOpen={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Now: Right away (first 24 to 48 hours)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /On the checklist:/ })).toBeNull();
  });

  it('shows nothing from the checklist when every phase is done', () => {
    setup({}, allDone);
    expect(screen.queryByText(/^Now:/)).toBeNull();
    expect(screen.queryByRole('button', { name: /On the checklist:/ })).toBeNull();
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
