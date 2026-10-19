/**
 * #176: the web flow has no picker and no Sent screen. Back on a moment's first form goes to the
 * path, a draft left on the hook's 'template' step goes to the path, and Done on the last person
 * hands the result to the app (which opens the path with a note). Mobile keeps its picker; the
 * hook still starts on 'template'.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { Contact, SessionDetails } from '@griever/shared';
import { Flow } from './Flow';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: 'https://example.com/margaret',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

const contact = (id: string, name: string): Contact => ({
  contactId: id,
  name,
  phone: '+16175550101',
  email: null,
  tier: 'family',
  source: 'manual',
  createdAt: 1,
});
const CONTACTS = [contact('c1', 'Aunt Carol'), contact('c2', 'Uncle Joe')];

function renderFlow(draft: SendFlowDraft | null) {
  const handlers = {
    onDraftChange: vi.fn(),
    onExitToLanding: vi.fn(),
    onFinished: vi.fn(),
    onEditSession: vi.fn(),
    onAddContact: vi.fn(),
  };
  render(
    <Flow
      session={session}
      draft={draft}
      drafts={{}}
      contacts={CONTACTS}
      notifiedContactIds={[]}
      {...handlers}
    />,
  );
  return handlers;
}

type User = ReturnType<typeof userEvent.setup>;

async function startSending(user: User) {
  await user.click(screen.getByRole('button', { name: /^Text (1 person|2 people|these people)/ }));
}

/** Hands the active person's message off by copying it, then taps Next or Done. */
async function handOffAndAdvance(user: User, button: 'Next' | 'Done') {
  await user.click(screen.getByRole('button', { name: 'Copy message' }));
  await user.click(await screen.findByRole('button', { name: button }));
}

beforeEach(() => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

describe('Done on the last person', () => {
  it.each([
    ['announcement', undefined],
    ['service', undefined],
    ['aftercare', undefined],
    ['obituary', 'obituary-link'],
  ] as const)('%s: reports who was told, once, and shows no Sent screen', async (category, templateOverrideId) => {
    const user = userEvent.setup();
    const { onFinished } = renderFlow(
      freshDraft({
        templateCategory: category,
        templateOverrideId: templateOverrideId ?? null,
        step: 'review',
        selectedContactIds: ['c1'],
        fields: { serviceDate: 'June 3, 2026', serviceTime: '10:00', serviceLocation: 'St Mary', thankYouNote: 'Thank you' },
      }),
    );
    await startSending(user);
    await handOffAndAdvance(user, 'Done');

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({ category, deliveredIds: ['c1'], total: 1 });
    expect(screen.queryByRole('button', { name: 'Back to home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add service details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send another message' })).not.toBeInTheDocument();
  });

  it('counts a skipped person in the total but not as told', async () => {
    const user = userEvent.setup();
    const { onFinished } = renderFlow(
      freshDraft({ templateCategory: 'announcement', step: 'review', selectedContactIds: ['c1', 'c2'] }),
    );
    await startSending(user);
    await handOffAndAdvance(user, 'Next');
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({ category: 'announcement', deliveredIds: ['c1'], total: 2 });
  });

  it('reports nobody told when every person was skipped', async () => {
    const user = userEvent.setup();
    const { onFinished } = renderFlow(
      freshDraft({ templateCategory: 'announcement', step: 'review', selectedContactIds: ['c1'] }),
    );
    await startSending(user);
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onFinished).toHaveBeenCalledWith({ category: 'announcement', deliveredIds: [], total: 1 });
  });

  it('opened again already at sent (no send job), reports the saved list once', () => {
    const { onFinished } = renderFlow(
      freshDraft({ templateCategory: 'announcement', step: 'sent', selectedContactIds: ['c1'] }),
    );
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished).toHaveBeenCalledWith({ category: 'announcement', deliveredIds: ['c1'], total: 1 });
  });
});

describe('leaving a first form', () => {
  it.each([
    ['announcement', 'announce'],
    ['service', 'details'],
    ['aftercare', 'details'],
    ['obituary', 'contacts'],
  ] as const)('%s: Back on the first form goes to the path', async (category, step) => {
    const user = userEvent.setup();
    const { onExitToLanding } = renderFlow(
      freshDraft({
        templateCategory: category,
        templateOverrideId: category === 'obituary' ? 'obituary-link' : null,
        step,
      }),
    );
    expect(onExitToLanding).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onExitToLanding).toHaveBeenCalledTimes(1);
  });

  it('Back on a later step goes back one step, not to the path', async () => {
    const user = userEvent.setup();
    const { onExitToLanding } = renderFlow(freshDraft({ templateCategory: 'announcement', step: 'contacts' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeInTheDocument();
    expect(onExitToLanding).not.toHaveBeenCalled();
  });

  it('a flow with nothing chosen (the hook\'s picker step) goes to the path and shows no picker', () => {
    const { onExitToLanding } = renderFlow(null);
    expect(onExitToLanding).toHaveBeenCalled();
    expect(screen.queryByText('What would you like to send?')).not.toBeInTheDocument();
  });

  it('announcement: Continue goes straight to the people', async () => {
    const user = userEvent.setup();
    renderFlow(freshDraft({ templateCategory: 'announcement', step: 'announce' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Who should know?' })).toBeInTheDocument();
    expect(screen.queryByText('Do you know the service details?')).not.toBeInTheDocument();
  });
});
