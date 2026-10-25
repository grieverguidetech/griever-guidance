import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { accountStore } from '@griever/data-local';
import userEvent from '@testing-library/user-event';
import { freshDraft } from '@griever/hooks';
import type { Session } from '@griever/hooks';
import type { MomentKey } from '@griever/shared';
import { PathLanding, finishNoteSpoken, finishNoteText } from './PathLanding';
import type { FinishNote } from './PathLanding';

const session: Session = {
  id: 's1',
  flowId: '11111111-1111-4111-8111-111111111111',
  ownerId: null,
  role: 'owner',
  createdAt: '2026-05-30T00:00:00.000Z',
  lastOpenedAt: '2026-05-30T00:00:00.000Z',
  personName: 'Margaret Hale',
  dateOfPassing: '2026-05-29',
  senderName: 'Anna',
  obituaryUrl: '',
  drafts: {},
  serviceReady: false,
  recipientsNotified: { announcement: ['contact-id-1'] },
  momentCompletedAt: { announce: '2026-05-30T00:00:00.000Z' },
  remindersScheduled: [],
};

describe('PathLanding share', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });

  it('shares the checklist in the real order, without contacts (C10, C3)', async () => {
    const user = userEvent.setup();
    const share = vi.fn(async (_data: { text: string }) => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(
      <PathLanding
        session={session}
        onBack={vi.fn()}
        onStartMoment={vi.fn()}
        onEditPerson={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Share these details' }));
    const { text } = share.mock.calls[0][0];
    const order = ['Announce the passing', 'Share the service', 'Share the obituary', 'Send thank-yous'].map(
      (label) => text.indexOf(label),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain('- Done: Announce the passing');
    expect(text).not.toContain('contact-id-1');
  });
});

describe('PathLanding Home link (#112)', () => {
  it('has a Back control, and no other-people list or "Someone else I\'ve lost"', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<PathLanding session={session} onBack={onBack} onStartMoment={vi.fn()} onEditPerson={vi.fn()} />);
    expect(screen.queryByText("Other people you're writing about")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Someone else I've lost" })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

function renderPath(
  over: Partial<Session> = {},
  props: { note?: FinishNote | null; onCloseNote?: () => void } = {},
) {
  const handlers = { onBack: vi.fn(), onStartMoment: vi.fn(), onEditPerson: vi.fn() };
  render(<PathLanding session={{ ...session, ...over }} {...handlers} {...props} />);
  return handlers;
}


describe('PathLanding finish note (#176)', () => {
  it.each<[MomentKey, string]>([
    ['announce', 'Everyone has been told.'],
    ['service', 'The service details have been shared.'],
    ['obituary', 'The obituary has been shared.'],
    ['thanks', 'Your thank-yous have been sent.'],
  ])('says the agreed words for %s when everyone was told', (moment, words) => {
    expect(finishNoteText({ moment, told: 3, total: 3 })).toBe(words);
    renderPath({}, { note: { moment, told: 3, total: 3 } });
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(finishNoteSpoken({ moment, told: 3, total: 3 })).toContain(words);
  });

  it('counts, and says how to reach the others, when anyone was skipped', () => {
    renderPath({}, { note: { moment: 'announce', told: 2, total: 5 } });
    expect(screen.getByText('You told 2 of 5. You can text the others from your own Messages app any time.')).toBeInTheDocument();
    expect(screen.queryByText('Everyone has been told.')).not.toBeInTheDocument();
  });

  it('keeps the C2 line in the note, and calm copy (C7)', () => {
    renderPath({}, { note: { moment: 'announce', told: 1, total: 1 } });
    expect(screen.getByText(/We don't keep a copy of what was sent/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('!');
  });

  it('when no one was texted, says so and leaves out the no-copy line', () => {
    const note: FinishNote = { moment: 'announce', told: 0, total: 2 };
    renderPath({}, { note });
    expect(screen.getByText('No one was texted this time. You can come back to this any time.')).toBeInTheDocument();
    expect(screen.queryByText(/We don't keep a copy/)).not.toBeInTheDocument();
    expect(finishNoteSpoken(note)).not.toContain("We don't keep a copy");
    expect(finishNoteText(note)).not.toMatch(/You told 0/);
  });

  it('stays until it is closed', async () => {
    const user = userEvent.setup();
    const onCloseNote = vi.fn();
    renderPath({}, { note: { moment: 'service', told: 1, total: 1 }, onCloseNote });
    const close = screen.getByRole('button', { name: 'Close note' });
    expect(close).toHaveClass('gg-btn-bar'); // 44px minimum width
    await user.click(close);
    expect(onCloseNote).toHaveBeenCalledOnce();
    // The button leaves the page, so focus goes to the heading.
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toHaveFocus();
  });
});

describe('PathLanding hub (#176)', () => {
  it('has Edit person, which asks to edit', async () => {
    const user = userEvent.setup();
    const { onEditPerson } = renderPath();
    await user.click(screen.getByRole('button', { name: 'Edit person' }));
    expect(onEditPerson).toHaveBeenCalledOnce();
  });

  it('makes a done row a button that starts that moment again', async () => {
    const user = userEvent.setup();
    const { onStartMoment } = renderPath();
    await user.click(screen.getByRole('button', { name: /Told close family/ }));
    expect(onStartMoment).toHaveBeenCalledWith('announce');
  });

  it('keeps the done date and the count on the reopened row, and one Start card', () => {
    renderPath();
    const done = screen.getByRole('button', { name: /Told close family/ });
    expect(done).toHaveTextContent('1 person');
    expect(done).toHaveTextContent(/May (29|30), 2026/); // local time zone
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1);
  });

  it('shows Started and Continue for a half-written moment, and plain Start for an empty one', () => {
    const half = freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } });
    renderPath({ drafts: { service: half } });
    expect(screen.getByText(/Started/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('does not call a draft that was only opened "Started"', () => {
    const opened = freshDraft({ templateCategory: 'service', step: 'details' });
    renderPath({ drafts: { service: opened } });
    expect(screen.queryByText(/Started/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });
});

describe('PathLanding paywall demo (#292)', () => {
  const renderHub = (paymentsEnabled: boolean, onStartMoment = vi.fn()) =>
    render(
      <PathLanding
        session={session}
        onBack={vi.fn()}
        onStartMoment={onStartMoment}
        onEditPerson={vi.fn()}
        paymentsEnabled={paymentsEnabled}
      />,
    );
  const locked = () => screen.queryAllByRole('button').filter((b) => b.getAttribute('aria-disabled') === 'true');

  it('flag off: no row is locked, no reason is shown, and a row starts its task', async () => {
    const user = userEvent.setup();
    const onStartMoment = vi.fn();
    renderHub(false, onStartMoment);
    expect(locked()).toHaveLength(0);
    expect(screen.queryByText('Included with the full plan')).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Share the obituary/ }));
    expect(onStartMoment).toHaveBeenCalledWith('obituary');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('flag on: the service and thank-you rows lock and read the reason; the announcement stays open', () => {
    renderHub(true);
    expect(locked().map((b) => b.textContent)).toEqual([
      expect.stringContaining('Share the service'),
      expect.stringContaining('Send thank-yous'),
    ]);
    for (const row of locked()) {
      expect(row.hasAttribute('disabled')).toBe(false);
      expect(row.getAttribute('aria-describedby')).toBeTruthy();
      expect(row.textContent).toContain('Included with the full plan');
    }
    expect(screen.getByRole('button', { name: /^(Announce the passing|Told close family)/ }).getAttribute('aria-disabled')).toBeNull();
  });

  it('a tap on a locked row opens the dialog and does not start the task; Escape returns focus to that row', async () => {
    const user = userEvent.setup();
    const onStartMoment = vi.fn();
    renderHub(true, onStartMoment);
    const row = locked()[0];
    await user.click(row);
    expect(screen.getByRole('dialog', { name: 'The full plan' })).toBeTruthy();
    expect(onStartMoment).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it('Close returns focus to the row that opened the dialog', async () => {
    const user = userEvent.setup();
    renderHub(true);
    const row = locked()[1];
    await user.click(row);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(row);
  });

  it('a tap outside the dialog closes it and returns focus to the row', async () => {
    const user = userEvent.setup();
    renderHub(true);
    const row = locked()[0];
    await user.click(row);
    await user.pointer({ keys: '[MouseLeft]', target: screen.getByRole('dialog').parentElement as HTMLElement });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(row));
  });

  it('works from the keyboard: Enter and Space on a locked row open the dialog, and the task does not start', async () => {
    const user = userEvent.setup();
    const onStartMoment = vi.fn();
    renderHub(true, onStartMoment);
    const row = locked()[0];
    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'The full plan' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(row);
    await user.keyboard(' ');
    expect(screen.getByRole('dialog', { name: 'The full plan' })).toBeTruthy();
    expect(onStartMoment).not.toHaveBeenCalled();
  });

  it('hides the visible reason from the screen reader, which still gets it as the description', () => {
    renderHub(true);
    const row = locked()[0];
    const reason = screen.getAllByText('Included with the full plan')[0];
    expect(reason.getAttribute('aria-hidden')).toBe('true');
    expect(row.getAttribute('aria-describedby')).toBe(reason.id);
  });
});

describe('PathLanding "What you\'ll need" in the header (#194)', () => {
  afterEach(async () => {
    cleanup();
    await accountStore.setChecklistTicks([]);
    document.body.style.overflow = '';
  });

  it('is a top-bar button next to Back, and the body has no second one', () => {
    renderPath();
    const buttons = screen.getAllByRole('button', { name: "What you'll need" });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveClass('gg-btn-bar');
    expect(buttons[0].parentElement).toBe(screen.getByRole('button', { name: 'Back' }).parentElement);
  });

  it('tabs from Back to "What you\'ll need" to the page content', async () => {
    const user = userEvent.setup();
    renderPath();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: "What you'll need" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Edit person' })).toHaveFocus();
  });

  it('opens the closable sheet without leaving the hub, and returns focus', async () => {
    const user = userEvent.setup();
    renderPath();
    const trigger = screen.getByRole('button', { name: "What you'll need" });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
