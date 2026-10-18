/**
 * The Sent screen (#167): Done on the last person shows it, it says so calmly (C7), and
 * "Back to home" hands over to Home. The real send flow drives it through `Flow`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { Contact, SessionDetails } from '@griever/shared';
import { Flow } from '../app/Flow';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

const CAROL: Contact = {
  contactId: 'c1',
  name: 'Aunt Carol',
  phone: '+16175550101',
  email: null,
  tier: 'family',
  source: 'manual',
  createdAt: 1,
};

function renderFlow(draft: SendFlowDraft) {
  const onHome = vi.fn();
  const onDraftChange = vi.fn();
  render(
    <Flow
      session={session}
      draft={draft}
      drafts={{}}
      contacts={[CAROL]}
      notifiedContactIds={[]}
      onDraftChange={onDraftChange}
      onExitToLanding={vi.fn()}
      onHome={onHome}
      onEditSession={vi.fn()}
      onAddContact={vi.fn()}
    />,
  );
  return { onHome, onDraftChange };
}

/** From the review step: text the one person ("Text 1 person" or "Text these people"), then Done. */
async function sendToCarol(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Text (1 person|these people)/ }));
  await user.click(screen.getByRole('button', { name: 'Copy message' }));
  await user.click(await screen.findByRole('button', { name: 'Done' }));
}

beforeEach(() => {
  // "Copy message", not "Share": the hand-off itself is not under test here.
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

describe('Sent screen (#167)', () => {
  it('announcement: Done shows Sent, with "Add service details" and "Back to home"', async () => {
    const user = userEvent.setup();
    const { onHome } = renderFlow(
      freshDraft({ templateCategory: 'announcement', step: 'review', serviceDetailsKnown: 'no', selectedContactIds: ['c1'] }),
    );
    await sendToCarol(user);

    expect(screen.getByRole('heading', { level: 1, name: 'Everyone has been told.' })).toBeInTheDocument();
    expect(screen.getByText(/1 person now knows about Margaret Hayes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add service details' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('!'); // C7

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('service details: Done shows Sent, with "Send another message" and "Back to home"', async () => {
    const user = userEvent.setup();
    const { onHome } = renderFlow(
      freshDraft({
        templateCategory: 'service',
        step: 'review',
        selectedContactIds: ['c1'],
        fields: { serviceDate: 'June 3, 2026', serviceTime: '10:00', serviceLocation: 'St Mary' },
      }),
    );
    await sendToCarol(user);

    expect(screen.getByRole('heading', { level: 1, name: 'Your message has been sent.' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('!'); // C7

    await user.click(screen.getByRole('button', { name: 'Back to home' }));
    expect(onHome).toHaveBeenCalledTimes(1);

    // "Send another message" still goes back to the picker for the same person.
    await user.click(screen.getByRole('button', { name: 'Send another message' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'What would you like to send?' })).toBeInTheDocument();
  });

  it('opened again at Sent (no send job in memory), still counts who was messaged', () => {
    renderFlow(freshDraft({ templateCategory: 'announcement', step: 'sent', selectedContactIds: ['c1'] }));

    expect(screen.getByRole('heading', { level: 1, name: 'Everyone has been told.' })).toBeInTheDocument();
    expect(screen.getByText(/1 person now knows about Margaret Hayes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to home' })).toBeInTheDocument();
  });
});
