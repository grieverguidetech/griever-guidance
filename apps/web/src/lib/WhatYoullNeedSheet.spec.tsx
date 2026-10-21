/** #193: "What you'll need" opens as a sheet over "Who are we writing about?". */
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import type { Session } from '@griever/hooks';
import { SessionSetup } from '../screens/SessionSetup';
import { WhatYoullNeedProvider } from './whatYoullNeedContext';

const empty = { personName: '', senderName: '' } as Session;

function Harness({ goToScreen = vi.fn() }: { goToScreen?: () => void }) {
  const [session, setSession] = useState<Session>(empty);
  return (
    <WhatYoullNeedProvider onWhatYoullNeed={goToScreen}>
      <SessionSetup
        session={session}
        editing={false}
        onChange={(patch) => setSession((s) => ({ ...s, ...patch }))}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    </WhatYoullNeedProvider>
  );
}

const trigger = () => screen.getByRole('button', { name: "What you'll need" });

describe('What you will need sheet (#193)', () => {
  it('opens a labelled dialog over the form and does not leave the screen', async () => {
    const user = userEvent.setup();
    const goToScreen = vi.fn();
    render(<Harness goToScreen={goToScreen} />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: "What you'll need" });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(goToScreen).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
  });

  it('moves focus in, then back to the button on Close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the sheet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: /Life insurance/ })).toBeEnabled());
    for (let i = 0; i < 14; i++) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 14; i++) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('keeps what was typed in the form after the sheet closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByLabelText('Their name')).toHaveValue('Margaret Hayes');
  });

  it('shares the saved ticks with the checklist screen', async () => {
    const user = userEvent.setup();
    await accountStore.setChecklistTicks(['life-insurance']);
    render(<Harness />);
    await user.click(trigger());
    const row = screen.getByRole('button', { name: /Life insurance policies/ });
    await waitFor(() => expect(row).toHaveAttribute('aria-pressed', 'true'));
    await user.click(screen.getByRole('button', { name: /Military discharge/ }));
    await waitFor(async () => expect(await accountStore.getChecklistTicks()).toEqual(['life-insurance', 'military-papers']));
    await accountStore.setChecklistTicks([]);
  });

  it('Escape closes an open tip first, then the sheet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Why we list this' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
