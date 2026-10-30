import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy, screenCopy } from '@griever/copy';
import { CHECKLIST_PHASES, type ChecklistFields } from '@griever/shared';
import { PhaseList } from './PhaseList';

const copy = screenCopy('cmsChecklist');
const noop = () => undefined;

function allHandled(): NonNullable<ChecklistFields['checklist']> {
  const out: NonNullable<ChecklistFields['checklist']> = {};
  for (const id of CHECKLIST_PHASES[0].itemIds) {
    out[id] = 'done';
  }
  return out;
}

function phaseHeading(key: keyof typeof copy.phases) {
  return screen.getByRole('heading', { level: 2, name: new RegExp(copy.phases[key].replace(/[()]/g, '\\$&')) });
}

describe('PhaseList', () => {
  it('renders an h2 per phase in order, and no h1', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(CHECKLIST_PHASES.map((p) => copy.phases[p.key]));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('shows the obituary note once', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    expect(screen.getAllByText(copy.obituaryNote)).toHaveLength(1);
  });

  it('shows no check on a phase with open items', () => {
    const { container } = render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows a hidden-text check on a done phase only', () => {
    render(<PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />);
    const first = phaseHeading('right-away');
    expect(within(first).getByText(copy.done)).toHaveClass('sr-only');
    expect(first.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(phaseHeading('first-days').querySelector('svg')).toBeNull();
  });

  it('counts not applicable items as handled', () => {
    const checklist = allHandled();
    checklist.pronouncement = 'not_applicable';
    render(<PhaseList checklist={checklist} onOpen={noop} onChange={noop} />);
    expect(phaseHeading('right-away').querySelector('svg')).not.toBeNull();
    expect(screen.getByText(copy.notApplicable, { selector: 'span' })).toBeInTheDocument();
  });

  it('opens an item from its label', async () => {
    const onOpen = vi.fn();
    render(<PhaseList checklist={{}} onOpen={onOpen} onChange={noop} />);
    await userEvent.click(screen.getByRole('button', { name: copy.items.custody }));
    expect(onOpen).toHaveBeenCalledWith('custody');
  });

  it('reports a state change with the item id', async () => {
    const onChange = vi.fn();
    render(<PhaseList checklist={{}} onOpen={noop} onChange={onChange} />);
    const group = screen.getByRole('group', { name: copy.items.pronouncement });
    await userEvent.click(within(group).getByRole('button', { name: copy.done }));
    expect(onChange).toHaveBeenCalledWith('pronouncement', 'done');
  });

  it('tabs through label, Done, Doesn\'t apply', async () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: copy.items.pronouncement })).toHaveFocus();
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent(copy.done);
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent(copy.notApplicable);
  });

  it('shows no counts and no delete control', () => {
    const { container } = render(<PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />);
    expect(container.textContent).not.toMatch(/\d+\s*of\s*\d+/);
    expect(container.textContent).not.toMatch(/%/);
    expect(screen.queryByRole('button', { name: /delete|remove/i })).toBeNull();
  });

  it('holds no hard-coded copy', () => {
    for (const file of ['PhaseList.tsx', 'ChecklistItemRow.tsx']) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8');
      expect(findHardCodedCopy(source, 'cmsChecklist')).toEqual([]);
    }
  });
});
