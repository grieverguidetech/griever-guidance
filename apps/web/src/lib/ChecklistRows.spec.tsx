/**
 * #176: the "What you'll need" list starts unticked, each row toggles, and ticks stay on this
 * device only (IndexedDB), never sent anywhere (C3).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import { screenCopy } from '@griever/copy';
import { ChecklistRows } from './ChecklistRows';
import { WhatYoullNeedSheet } from './WhatYoullNeedSheet';

const ROWS = [
  'Any will or written wishes',
  'Pre-arranged funeral plans',
  'Social Security number and ID',
  'Life insurance policies',
  'Military discharge papers',
];

function renderList() {
  return render(<ChecklistRows />);
}

/** Rows are off until the saved ticks are read. */
const loaded = () => waitFor(() => expect(row('Life insurance policies')).toBeEnabled());

const row = (label: string) => screen.getByRole('button', { name: new RegExp(label) });

describe('Checklist rows (#176)', () => {
  it('starts with every item unticked, including will and funeral plans', async () => {
    renderList();
    await loaded();
    for (const label of ROWS) expect(row(label)).toHaveAttribute('aria-pressed', 'false');
    expect(await accountStore.getChecklistTicks()).toEqual([]);
  });

  it('ticks a row on tap, strikes the text through, and unticks on a second tap', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();
    await user.click(row('Life insurance policies'));
    expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'true');
    // Strikethrough is not the only cue: the pressed state and the filled icon change too.
    expect(screen.getByText('Life insurance policies')).toHaveClass('line-through');
    expect(row('Life insurance policies').querySelector('svg')).toBeInTheDocument();
    expect(row('Military discharge papers')).toHaveAttribute('aria-pressed', 'false');

    await user.click(row('Life insurance policies'));
    expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Life insurance policies')).not.toHaveClass('line-through');
  });

  it('saves ticks on this device and shows them again after a reload', async () => {
    const user = userEvent.setup();
    await accountStore.setChecklistTicks(['life-insurance']);
    const first = renderList();
    await loaded();
    await user.click(row('Social Security number and ID'));
    await user.click(row('Any will or written wishes'));
    await waitFor(async () =>
      expect((await accountStore.getChecklistTicks()).sort()).toEqual(['life-insurance', 'ssn-and-id', 'will-or-wishes']),
    );

    first.unmount();
    renderList();
    await waitFor(() => expect(row('Social Security number and ID')).toHaveAttribute('aria-pressed', 'true'));
    expect(row('Any will or written wishes')).toHaveAttribute('aria-pressed', 'true');
    // A tick saved before this visit is kept, not overwritten by the new ones.
    expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'true');
    expect(row('Military discharge papers')).toHaveAttribute('aria-pressed', 'false');
  });

  it('never goes to the network, and never reminds, notifies or counts', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const user = userEvent.setup();
      render(<WhatYoullNeedSheet onClose={vi.fn()} />);
      await loaded();
      await user.click(row('Pre-arranged funeral plans'));
      await waitFor(async () => expect(await accountStore.getChecklistTicks()).toEqual(['pre-arranged-plans']));
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByText("We won't remind you about this list.")).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(/\d of \d|remaining|left to gather/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps working when storage cannot be read', async () => {
    vi.spyOn(accountStore, 'getChecklistTicks').mockRejectedValue(new Error('no storage'));
    vi.spyOn(accountStore, 'setChecklistTicks').mockRejectedValue(new Error('no storage'));
    const user = userEvent.setup();
    renderList();
    await loaded();
    await user.click(row('Life insurance policies'));
    expect(row('Life insurance policies')).toHaveAttribute('aria-pressed', 'true');
    vi.restoreAllMocks();
  });
});

describe('Nested notes under the gather rows (#605)', () => {
  const notes = screenCopy('cmsChecklist').gatherNotes;

  it('shows the Social Security, insurance and military notes under their items', async () => {
    renderList();
    await loaded();
    expect(screen.getByText(notes.ssn)).toBeInTheDocument();
    expect(screen.getByText(notes.insurance)).toBeInTheDocument();
    expect(screen.getByText(notes.military)).toBeInTheDocument();
    expect(notes.ssn).toBe(
      "You'll need this number when you deal with the funeral home, insurance and banks. You do not need to add it to your account.",
    );
  });

  it('says each is not needed on the account, and has no exclamation point', () => {
    for (const note of Object.values(notes)) {
      expect(note).toContain('You do not need to add it to your account.');
      expect(note).not.toContain('!');
    }
  });

  it('describes each row by its note and has no tooltip button', async () => {
    renderList();
    await loaded();
    expect(row('Social Security number and ID')).toHaveAccessibleDescription(notes.ssn);
    expect(row('Life insurance policies')).toHaveAccessibleDescription(notes.insurance);
    expect(row('Military discharge papers')).toHaveAccessibleDescription(notes.military);
    expect(screen.queryByRole('button', { name: 'Why we list this' })).toBeNull();
  });

  it('keeps the note when the row is ticked', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();
    await user.click(row('Social Security number and ID'));
    expect(screen.getByText(notes.ssn)).toBeInTheDocument();
  });
});
