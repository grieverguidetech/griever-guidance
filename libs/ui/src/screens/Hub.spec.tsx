import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Hub } from './Hub';
import type { HubCopy, HubProps, HubRow } from './Hub';

const copy: HubCopy = {
  heading: 'One thing at a time.',
  intro: "Here's what usually comes next.",
  back: 'Back',
  checklist: "What you'll need",
  editPerson: 'Edit person',
  start: 'Start',
  continue: 'Continue',
  tagStarted: 'Started',
  tagNext: 'Next',
  metaStarted: 'Started',
  lockedReason: 'Included with the full plan',
  notInAppYet: 'Not in the app yet.',
  moments: {
    announce: { title: 'Announce the passing', body: 'A gentle note.', doneLabel: 'Told close family' },
    service: { title: 'Share the service', body: 'Once the date is set.', doneLabel: 'Shared the service' },
    obituary: { title: 'Share the obituary', body: 'Most papers want it early.', doneLabel: 'Shared the obituary' },
    thanks: { title: 'Send thank-yous', body: 'Afterwards.', doneLabel: 'Sent thank-yous' },
  },
};

const rows: HubRow[] = [
  { key: 'announce', status: 'done', started: false, locked: false, meta: '1 person · Send again' },
  { key: 'service', status: 'next', started: false, locked: false },
  { key: 'obituary', status: 'later', started: true, locked: false },
  { key: 'thanks', status: 'later', started: false, locked: true },
];

function setup(over: Partial<HubProps> = {}) {
  const handlers = {
    onBack: vi.fn(),
    onWhatYoullNeed: vi.fn(),
    onEdit: vi.fn(),
    onStart: vi.fn(),
    onLocked: vi.fn(),
  };
  render(<Hub copy={copy} eyebrow="For Margaret" rows={rows} {...handlers} {...over} />);
  return handlers;
}

describe('Hub', () => {
  it('has one h1 and the eyebrow and intro', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getByText('For Margaret')).toBeInTheDocument();
    expect(screen.getByText("Here's what usually comes next.")).toBeInTheDocument();
  });

  it('answers Back, What you will need and Edit person', async () => {
    const user = userEvent.setup();
    const h = setup();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(screen.getByRole('button', { name: 'Edit person' }));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onWhatYoullNeed).toHaveBeenCalledOnce();
    expect(h.onEdit).toHaveBeenCalledOnce();
  });

  it('tells assistive tech that What you will need opens a dialog', () => {
    setup();
    expect(screen.getByRole('button', { name: "What you'll need" })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('shows a done step with its meta, and starting it again asks for that step', async () => {
    const user = userEvent.setup();
    const h = setup();
    const done = screen.getByRole('button', { name: /Told close family/ });
    expect(done).toHaveTextContent('1 person · Send again');
    await user.click(done);
    expect(h.onStart).toHaveBeenCalledWith('announce');
  });

  it('has exactly one Start, on the next step', async () => {
    const user = userEvent.setup();
    const h = setup();
    const starts = screen.getAllByRole('button', { name: 'Start' });
    expect(starts).toHaveLength(1);
    expect(screen.getByText('Next')).toBeInTheDocument();
    await user.click(starts[0]);
    expect(h.onStart).toHaveBeenCalledWith('service');
  });

  it('says Started and Continue for a next step that was started', () => {
    setup({ rows: rows.map((r) => (r.key === 'service' ? { ...r, started: true } : r)) });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
  });

  it('marks a later step as started, and it opens that step', async () => {
    const user = userEvent.setup();
    const h = setup();
    const later = screen.getByRole('button', { name: /Share the obituary/ });
    expect(later).toHaveTextContent('Share the obituary · Started');
    await user.click(later);
    expect(h.onStart).toHaveBeenCalledWith('obituary');
  });

  it('puts a decorative lock icon at the end of a locked row, outside its name and description', () => {
    setup();
    const locked = screen.getByRole('button', { name: /Send thank-yous/ });
    const icon = within(locked).getByTestId('lock-icon');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
    // The name and reason are the words only.
    expect(locked).toHaveAccessibleName(/^Send thank-yous\s*Afterwards\.$/);
    expect(locked).toHaveAccessibleDescription('Included with the full plan');
  });

  it('shows no lock on rows that are not locked', () => {
    setup();
    expect(screen.getAllByTestId('lock-icon')).toHaveLength(1);
  });

  it('Back and What you will need are 44px tertiary buttons with no fill or border', () => {
    setup();
    for (const name of ['Back', "What you'll need"]) {
      const style = getComputedStyle(screen.getByRole('button', { name }));
      expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(style.backgroundColor);
      expect(parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it('keeps a locked step focusable, aria-disabled and explained, and it asks for the paywall', async () => {
    const user = userEvent.setup();
    const h = setup();
    const locked = screen.getByRole('button', { name: /Send thank-yous/ });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(locked).not.toBeDisabled();
    expect(locked).toHaveAccessibleDescription('Included with the full plan');
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(locked).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(h.onLocked).toHaveBeenCalledWith(locked);
    expect(h.onStart).not.toHaveBeenCalled();
  });

  it('shows the children between the heading and the steps, and the footer after', () => {
    setup({ children: <p>A note</p>, footer: <p>A footer</p> });
    const note = screen.getByText('A note');
    const heading = screen.getByRole('heading', { level: 1 });
    const steps = screen.getByRole('button', { name: /Told close family/ });
    const footer = screen.getByText('A footer');
    expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(steps.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(document.body).getAllByRole('button').length).toBe(7);
  });

  it('shows an unavailable step as text with its reason: no button, nothing to press', () => {
    const h = setup({ rows: rows.map((r) => (r.key === 'obituary' ? { ...r, unavailable: true } : r)) });
    expect(screen.getByText('Share the obituary')).toBeInTheDocument();
    expect(screen.getByText('Not in the app yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share the obituary/ })).not.toBeInTheDocument();
    expect(h.onStart).not.toHaveBeenCalled();
    // Plain text on web: not a tab stop.
    expect(screen.getByText('Not in the app yet.').closest('[tabindex]')).toBeNull();
  });

  it('keeps the HTML valid: no div inside any button', () => {
    setup();
    for (const button of screen.getAllByRole('button')) {
      expect(button.querySelector('div'), button.outerHTML).toBeNull();
    }
  });

  it('gives every step row and header button at least 44 pixels', () => {
    setup();
    for (const button of screen.getAllByRole('button')) {
      const style = getComputedStyle(button);
      expect(parseInt(style.minHeight, 10), button.textContent ?? '').toBeGreaterThanOrEqual(44);
    }
  });
});
