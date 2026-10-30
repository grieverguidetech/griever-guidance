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
  return screen.getByRole('heading', {
    level: 3,
    name: new RegExp(copy.phases[key].replace(/[()]/g, '\\$&')),
  });
}

describe('PhaseList', () => {
  it('renders an h3 per phase in order, and no h1', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(names).toEqual(CHECKLIST_PHASES.map((p) => copy.phases[p.key]));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('puts a disclosure button in each h3, open for the current phase only', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    for (const phase of CHECKLIST_PHASES) {
      const button = within(phaseHeading(phase.key)).getByRole('button');
      const open = phase.key === 'right-away';
      expect(button).toHaveAttribute('aria-expanded', String(open));
      expect(
        document.getElementById(button.getAttribute('aria-controls') ?? ''),
      ).not.toBeNull();
    }
    expect(
      screen.getByRole('button', { name: copy.items.pronouncement }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.items['burial-or-cremation'] }),
    ).toBeNull();
  });

  it('opens the first phase that is not done', () => {
    render(
      <PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />,
    );
    expect(
      within(phaseHeading('right-away')).getByRole('button'),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(phaseHeading('first-days')).getByRole('button'),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes every phase when everything is handled', () => {
    const all: NonNullable<ChecklistFields['checklist']> = {};
    for (const phase of CHECKLIST_PHASES) {
      for (const id of phase.itemIds) {
        all[id] = 'done';
      }
    }
    render(<PhaseList checklist={all} onOpen={noop} onChange={noop} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('toggles a phase from its heading button', async () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    const button = within(phaseHeading('first-days')).getByRole('button');
    const items = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    );
    expect(items).toHaveAttribute('hidden');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(items).not.toHaveAttribute('hidden');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(items).toHaveAttribute('hidden');
  });

  it('opens the new current phase when the current one is finished, and keeps focus', () => {
    const { rerender } = render(
      <PhaseList checklist={{}} onOpen={noop} onChange={noop} />,
    );
    const first = within(phaseHeading('right-away')).getByRole('button');
    const second = within(phaseHeading('first-days')).getByRole('button');
    first.focus();
    expect(second).toHaveAttribute('aria-expanded', 'false');
    rerender(
      <PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />,
    );
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(first).toHaveFocus();
  });

  it('keeps a finished phase closed if the user closed it', async () => {
    const { rerender } = render(
      <PhaseList checklist={{}} onOpen={noop} onChange={noop} />,
    );
    const first = within(phaseHeading('right-away')).getByRole('button');
    await userEvent.click(first);
    rerender(
      <PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />,
    );
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(phaseHeading('first-days')).getByRole('button'),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides the chevron from assistive tech and turns it with the state', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    const openIcon = within(phaseHeading('right-away'))
      .getByRole('button')
      .querySelector('svg');
    const closedIcon = within(phaseHeading('first-days'))
      .getByRole('button')
      .querySelector('svg');
    expect(openIcon).toHaveAttribute('aria-hidden', 'true');
    expect(openIcon).toHaveClass('rotate-180');
    expect(closedIcon).not.toHaveClass('rotate-180');
  });

  it('shows the obituary note once', () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    expect(screen.getAllByText(copy.obituaryNote)).toHaveLength(1);
  });

  it('shows no check on a phase with open items', () => {
    const { container } = render(
      <PhaseList checklist={{}} onOpen={noop} onChange={noop} />,
    );
    expect(container.querySelector('svg:not([data-chevron])')).toBeNull();
  });

  it('shows a hidden-text check on a done phase only', () => {
    render(
      <PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />,
    );
    const first = phaseHeading('right-away');
    expect(within(first).getByText(copy.done)).toHaveClass('sr-only');
    expect(first.querySelector('svg:not([data-chevron])')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(
      phaseHeading('first-days').querySelector('svg:not([data-chevron])'),
    ).toBeNull();
  });

  it('counts not applicable items as handled', () => {
    const checklist = allHandled();
    checklist.pronouncement = 'not_applicable';
    render(<PhaseList checklist={checklist} onOpen={noop} onChange={noop} />);
    expect(
      phaseHeading('right-away').querySelector('svg:not([data-chevron])'),
    ).not.toBeNull();
    expect(
      screen.getByText(copy.notApplicable, { selector: 'span' }),
    ).toBeInTheDocument();
  });

  it('marks a done row with a hidden check and a not applicable row without one', () => {
    render(
      <PhaseList
        checklist={{ pronouncement: 'done', custody: 'not_applicable' }}
        onOpen={noop}
        onChange={noop}
      />,
    );
    // The label column only; the pressed toggle has its own check.
    const doneColumn = screen.getByRole('button', {
      name: copy.items.pronouncement,
    }).parentElement?.parentElement;
    const naColumn = screen.getByRole('button', { name: copy.items.custody })
      .parentElement?.parentElement;
    expect(doneColumn?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(naColumn?.querySelector('svg')).toBeNull();
  });

  it('opens an item from its label', async () => {
    const onOpen = vi.fn();
    render(<PhaseList checklist={{}} onOpen={onOpen} onChange={noop} />);
    await userEvent.click(
      screen.getByRole('button', { name: copy.items.custody }),
    );
    expect(onOpen).toHaveBeenCalledWith('custody');
  });

  it('reports a state change with the item id', async () => {
    const onChange = vi.fn();
    render(<PhaseList checklist={{}} onOpen={noop} onChange={onChange} />);
    const group = screen.getByRole('group', { name: copy.items.pronouncement });
    await userEvent.click(
      within(group).getByRole('button', { name: copy.done }),
    );
    expect(onChange).toHaveBeenCalledWith('pronouncement', 'done');
  });

  it("tabs through label, Done, Doesn't apply", async () => {
    render(<PhaseList checklist={{}} onOpen={noop} onChange={noop} />);
    await userEvent.tab();
    expect(
      screen.getByRole('button', { name: copy.phases['right-away'] }),
    ).toHaveFocus();
    await userEvent.tab();
    expect(
      screen.getByRole('button', { name: copy.items.pronouncement }),
    ).toHaveFocus();
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent(copy.done);
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent(copy.notApplicable);
  });

  it('shows no counts and no delete control', () => {
    const { container } = render(
      <PhaseList checklist={allHandled()} onOpen={noop} onChange={noop} />,
    );
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
