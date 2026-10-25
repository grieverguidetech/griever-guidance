/**
 * #176: the "What you'll need" list starts unticked, each row toggles, and ticks stay on this
 * device only (IndexedDB), never sent anywhere (C3).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import { ChecklistRows, SSN_TIP } from './ChecklistRows';
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

describe('Social Security tip (#209)', () => {
  const info = () => screen.getByRole('button', { name: 'Why we list this' });

  it('hides the tip by default and keeps no reason line under the item', async () => {
    renderList();
    await loaded();
    expect(info()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
    expect(row('Social Security number and ID').querySelector('.gg-card-meta')).toBeNull();
  });

  it('opens on click, closes on a second click, and flips aria-expanded', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();
    await user.click(info());
    expect(info()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(SSN_TIP);
    expect(info()).toHaveAttribute('aria-controls', screen.getByRole('status').id);
    await user.click(info());
    expect(info()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
  });

  it('opens with Enter, closes with Escape, and puts focus back on the button', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();
    info().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(SSN_TIP)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
    expect(info()).toHaveFocus();
  });

  it('closes on Escape but leaves focus alone when it is outside the row', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Elsewhere</button>
        <ChecklistRows />
      </>,
    );
    await loaded();
    await user.click(info());
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });

  it('closes when the Social Security row itself is ticked', async () => {
    const user = userEvent.setup();
    renderList();
    await loaded();
    await user.click(info());
    await user.click(row('Social Security number and ID'));
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
  });

  it('closes on a tap outside', async () => {
    const user = userEvent.setup();
    render(
      <>
        <h1>Elsewhere on the page</h1>
        <ChecklistRows />
      </>,
    );
    await loaded();
    await user.click(info());
    await user.click(screen.getByRole('heading', { name: 'Elsewhere on the page' }));
    expect(screen.queryByText(SSN_TIP)).not.toBeInTheDocument();
  });

  it('is at least 44 by 44 and has no exclamation point', () => {
    renderList();
    expect(info()).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(SSN_TIP).not.toContain('!');
  });

  it('uses the same words as the mobile list', () => {
    const mobile = readFileSync(resolve(process.cwd(), '../mobile/src/screens/WhatYoullNeedScreen.tsx'), 'utf8');
    const match = mobile.match(/SSN_TIP =\s*"([^"]+)"/);
    expect(match?.[1]).toBe(SSN_TIP);
  });
});
