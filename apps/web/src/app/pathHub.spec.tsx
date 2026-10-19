/**
 * #176: the path is the hub. Real App over real localStorage and in-memory IndexedDB.
 * Covers the note after the last person, reopening a done moment, thanks without a picker,
 * and "Edit person" on the path.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contactStore } from '@griever/data-local';
import { freshDraft } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

const DONE_AT = '2026-10-05T15:00:00.000Z';

function seed(extra: Record<string, unknown> = {}, drafts: Record<string, SendFlowDraft> = {}) {
  const session = {
    id: 's-1',
    personName: 'Margaret Hayes',
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: '2026-10-01T00:00:00.000Z',
    lastOpenedAt: '2026-10-10T00:00:00.000Z',
    drafts,
    draftsUpdatedAt: Object.fromEntries(Object.keys(drafts).map((k) => [k, '2026-10-10T00:00:00.000Z'])),
    serviceReady: true,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
    ...extra,
  };
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify([session]));
}

async function putContacts() {
  for (const [id, name, phone] of [
    ['c1', 'Aunt Carol', '+16175550148'],
    ['c2', 'Uncle Joe', '+16175550199'],
  ]) {
    await contactStore.put({ contactId: id, name, phone, email: null, tier: 'family', source: 'manual', createdAt: 1 });
  }
}

async function openPerson(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
  await screen.findByRole('heading', { name: 'One thing at a time.' });
}

beforeEach(() => {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

const noteRegion = (words: string) => screen.getByText(words).closest('[role="status"]') as HTMLElement;

describe('the note after the last person', () => {
  it('opens the path at once with the words for the moment, the C2 line, and a Close button', async () => {
    await putContacts();
    seed();
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    const region = noteRegion('Everyone has been told.');
    expect(region).toHaveTextContent("We don't keep a copy of what was sent");
    // The announcement now reads as done on the path, with the count.
    expect(screen.getByRole('button', { name: /Told close family/ })).toHaveTextContent('1 person');

    await user.click(within(region).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText('Everyone has been told.')).not.toBeInTheDocument();
  });

  it('says how many were told when someone was skipped, and does not mark the moment done', async () => {
    await putContacts();
    seed();
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(
      await screen.findByText('You told 0 of 1. You can text the others from your own Messages app any time.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Told close family/ })).not.toBeInTheDocument();
  });

  it('stays through the wait, and goes when the person goes anywhere else', async () => {
    await putContacts();
    seed();
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    await screen.findByText('Everyone has been told.');

    // No timer: a long wait changes nothing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByText('Everyone has been told.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await screen.findByRole('heading', { name: 'One thing at a time.' });
    expect(screen.queryByText('Everyone has been told.')).not.toBeInTheDocument();
  }, 20_000);

  it.each([
    ['service', 'The service details have been shared.'],
    ['obituary', 'The obituary has been shared.'],
  ] as const)('%s: Done opens the path with the moment\'s words', async (moment, words) => {
    await putContacts();
    const draft =
      moment === 'service'
        ? freshDraft({
            templateCategory: 'service',
            step: 'review',
            selectedContactIds: ['c1'],
            fields: { serviceDate: 'June 3, 2099', serviceTime: '10:00 am', serviceLocation: 'St Mary' },
          })
        : freshDraft({ templateCategory: 'obituary', templateOverrideId: 'obituary-link', step: 'review', selectedContactIds: ['c1'] });
    seed({ obituaryUrl: 'https://example.com/margaret' }, { [moment]: draft });
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    // Half done, so the row says Started; it is not the next card because the announcement is.
    await user.click(screen.getByRole('button', { name: moment === 'service' ? /Share the service/ : /Share the obituary/ }));
    if (moment === 'obituary') await user.click(screen.getByRole('button', { name: 'Choose who to send it to' }));
    await user.click(await screen.findByRole('button', { name: /^Text (1 person|these people)/ }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));
    expect(await screen.findByText(words)).toBeInTheDocument();
  }, 20_000);
});

describe('reopening a done moment', () => {
  it('opens a fresh, empty draft, keeps the done date, and adds to the count', async () => {
    await putContacts();
    seed(
      { recipientsNotified: { announcement: ['c1'] }, momentCompletedAt: { announce: DONE_AT } },
      { announcement: freshDraft({ templateCategory: 'announcement', step: 'sent', selectedContactIds: ['c1'] }) },
    );
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1); // one Start card

    await user.click(screen.getByRole('button', { name: /Told close family/ }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    // Already-told people may show; pick both.
    await user.click(await screen.findByRole('button', { name: /Uncle Joe/ }));
    if (screen.getByRole('button', { name: /Aunt Carol/ }).getAttribute('aria-pressed') !== 'true') {
      await user.click(screen.getByRole('button', { name: /Aunt Carol/ }));
    }
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /^Text 2 people|^Text these people/ }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    await user.click(await screen.findByRole('button', { name: 'Done' }));

    await screen.findByText('Everyone has been told.');
    const row = screen.getByRole('button', { name: /Told close family/ });
    expect(row).toHaveTextContent('2 people'); // c1 counted once, plus c2
    expect(row).toHaveTextContent(/October (4|5), 2026/); // the first done date stays
    const [saved] = JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
    expect(saved.momentCompletedAt.announce).toBe(DONE_AT);
  }, 30_000);
});

describe('thanks and Edit person', () => {
  it('starts thanks on its details form, with no picker, and Back returns to the path', async () => {
    seed({
      recipientsNotified: { announcement: ['c1'], service: ['c1'], obituary: ['c1'] },
      momentCompletedAt: { announce: DONE_AT, service: DONE_AT, obituary: DONE_AT },
      obituaryUrl: 'https://example.com/margaret',
    });
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('heading', { level: 1, name: /thank/i })).toBeInTheDocument();
    expect(screen.queryByText('What would you like to send?')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
  });

  it('Edit person opens the person details from the path, and Back returns to the path', async () => {
    seed();
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Edit person' }));
    expect(await screen.findByLabelText('Their name')).toHaveValue('Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
  });

  it('Edit person from a form still returns to that form', async () => {
    seed();
    const user = userEvent.setup();
    render(<App />);
    await openPerson(user);
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await screen.findByLabelText('Their name');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeInTheDocument();
  });
});
