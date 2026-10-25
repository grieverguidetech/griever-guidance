/** #193: "What you'll need" opens as a sheet over "Who are we writing about?". */
import { useState } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import type { Session } from '@griever/hooks';
import { SessionSetup } from '../screens/SessionSetup';
import { Profile } from '../screens/Profile';
import { TopBar } from './ui';

const empty = { personName: '', senderName: '' } as Session;

function Harness() {
  const [session, setSession] = useState<Session>(empty);
  return (
    <>
      <SessionSetup
        session={session}
        editing={false}
        onChange={(patch) => setSession((s) => ({ ...s, ...patch }))}
        onContinue={vi.fn()}
        onBack={vi.fn()}
      />
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: "What you'll need" });

describe('What you will need sheet (#193)', () => {
  // Runs even when a test fails, so saved ticks never leak into the next test.
  afterEach(async () => {
    cleanup();
    await accountStore.setChecklistTicks([]);
    document.body.style.overflow = '';
  });

  it('opens a labelled dialog over the form and does not leave the screen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog', { name: "What you'll need" });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
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

  it('moves focus to the sheet heading and shows a ring that stays on screen', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(trigger());
    const heading = screen.getByRole('heading', { name: "What you'll need", level: 2 });
    expect(heading).toHaveFocus();
    expect(heading.style.boxShadow).toContain('inset');
  });

  it('hides the page behind the sheet and locks scrolling, then restores both', async () => {
    const user = userEvent.setup();
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const { unmount } = render(<Harness />, { container: root.appendChild(document.createElement('div')) });
    await user.click(trigger());
    expect(root.inert).toBe(true);
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(root.inert).toBe(false);
    expect(root).not.toHaveAttribute('aria-hidden');
    expect(document.body.style.overflow).toBe('');
    unmount();
    root.remove();
  });

  it('marks the trigger as opening a dialog, and returns focus to it even if the click did not focus it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    // Safari: a click leaves focus on the body, so the ref has to carry it back.
    trigger().click();
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(trigger()).toHaveFocus();
  });

  it('TopBar opens the sheet by itself, so every screen behaves the same (#194)', async () => {
    const user = userEvent.setup();
    render(<TopBar onBack={vi.fn()} />);
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.getByRole('dialog', { name: "What you'll need" })).toBeInTheDocument();
  });

  it('keeps the death certificate card and the no-reminder line from the old page', async () => {
    const user = userEvent.setup();
    render(<TopBar onBack={vi.fn()} />);
    await user.click(trigger());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('The one people get wrong');
    expect(dialog).toHaveTextContent('Certified death certificates');
    expect(dialog).toHaveTextContent('8 to 10 certified copies');
    expect(dialog).toHaveTextContent("We won't remind you about this list.");
  });

  it('moves focus to the page heading when the button is gone on close', async () => {
    const user = userEvent.setup();
    let swap: () => void = () => undefined;
    function Swap() {
      const [swapped, setSwapped] = useState(false);
      swap = () => setSwapped(true);
      return swapped ? (
        <h1>Next screen</h1>
      ) : (
        <>
          <h1>First screen</h1>
          <TopBar onBack={vi.fn()} />
        </>
      );
    }
    render(<Swap />);
    await user.click(trigger());
    // The screen changes behind the sheet, so the opening button unmounts.
    act(() => swap());
    expect(screen.queryByRole('button', { name: "What you'll need", hidden: true })).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Next screen' })).toHaveFocus();
  });

  it('keeps the button on the right when there is no Back', () => {
    render(<TopBar />);
    expect(trigger()).toHaveClass('ml-auto');
  });

  it('does not submit the Profile form when Enter is pressed inside the open sheet', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    render(<Profile senderName="Anna" onBack={vi.fn()} onSave={onSave} onSignOut={vi.fn()} error={null} showChecklist={false} />);
    await user.click(trigger());
    const row = await screen.findByRole('button', { name: /Life insurance policies/ });
    await waitFor(() => expect(row).toBeEnabled());
    row.focus();
    await user.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });
});
