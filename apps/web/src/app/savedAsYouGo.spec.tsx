/**
 * "Saved as you go" (#25, DS-3): every flow step's values are on the device the moment they are
 * typed, and reopening the app puts the person back on that step. A "reload" here is an unmount and
 * a fresh <App /> over the same localStorage and IndexedDB, which is all a real reload keeps.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

function reload(view: { unmount: () => void }) {
  view.unmount();
  return render(<App />);
}

/** A reload now lands on Home (#112); the person is opened from there, on their path (#176). */
async function openFromHome(user: User, name = 'Margaret Hayes') {
  await user.click(await screen.findByRole('button', { name }));
}

/** A half-written message shows "Started" on the path; one tap on Continue resumes it. */
async function resume(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
}

async function onboardToLanding(user: User) {
  const view = render(<App />);
  await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
  await user.type(screen.getByLabelText('Mobile number'), '6175550148');
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
  await screen.findByText('Added so far — 1');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  return view;
}

async function startAnnouncement(user: User) {
  const view = await onboardToLanding(user);
  await user.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

const note = 'She was peaceful, and we were with her.';

describe('saved as you go', () => {
  it('says so in the agreed words, with no Save button', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    expect(
      screen.getByText('Everything is saved on this phone as you go. You can stop and come back.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('keeps the person and sender typed on the setup step', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
    await user.type(screen.getByLabelText(/Your name/), 'Peter');

    reload(view);
    await openFromHome(user);
    await screen.findByRole('heading', { name: 'One thing at a time.' });
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
  });

  it('keeps the announcement note and reopens on that step', async () => {
    const user = userEvent.setup();
    const view = await startAnnouncement(user);
    await user.type(screen.getByLabelText(/Anything you'd like to add/), note);

    reload(view);
    await openFromHome(user);
    expect(screen.getByText('Started')).toBeInTheDocument();
    await resume(user);
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Anything you'd like to add/)).toHaveValue(note);
  });

  it('goes from the announcement straight to the people, with no service question', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: /Aunt Carol/ })).toBeInTheDocument();
    expect(screen.queryByText('Do you know the service details?')).not.toBeInTheDocument();
  });

  it('keeps the chosen people and an edited message', async () => {
    const user = userEvent.setup();
    let view = await startAnnouncement(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    view = reload(view);
    await openFromHome(user);
    await resume(user);
    expect(await screen.findByRole('button', { name: /Aunt Carol/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Edit wording' }));
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.type(box, 'My own words');

    reload(view);
    await openFromHome(user);
    await resume(user);
    expect(await screen.findByText('My own words')).toBeInTheDocument();
  });

  it('never waits on the network when Continue moves on', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined)); // an offline fetch that never settles
    vi.stubGlobal('fetch', fetchSpy);
    try {
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(screen.getByRole('button', { name: /Aunt Carol/ })).toBeInTheDocument());
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the note after Back and Continue (resuming never resets the draft)', async () => {
    const user = userEvent.setup();
    await startAnnouncement(user);
    await user.type(screen.getByLabelText(/Anything you'd like to add/), note);
    await user.click(screen.getByRole('button', { name: 'Back' })); // the first form goes to the path
    await user.click(screen.getByRole('button', { name: 'Continue' })); // "Started": one tap resumes
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue(note);
  });

  it('opens the landing, not Review, when the last draft was mid-send', async () => {
    const user = userEvent.setup();
    const view = await startAnnouncement(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: /Aunt Carol/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: /^Text 1 person/ }));

    reload(view);
    await openFromHome(user);
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByRole('heading', { name: 'Announce the passing' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Read it once before it goes' })).not.toBeInTheDocument();
  });

  describe('which session reopens', () => {
    function seed(drafts: Array<{ name: string; openedAt: string; step: string }>) {
      const list = drafts.map((d, i) => ({
        id: `s-${i}`,
        personName: d.name,
        dateOfPassing: '',
        senderName: '',
        obituaryUrl: '',
        createdAt: d.openedAt,
        lastOpenedAt: d.openedAt,
        draft: {
          step: d.step,
          templateCategory: 'announcement',
          templateOverrideId: null,
          fields: { personalNote: `note for ${d.name}` },
          serviceDetailsKnown: null,
          selectedContactIds: [],
          place: null,
          includeFlowers: false,
          floristId: null,
          customFlorist: '',
          flowerDeliveryTarget: 'service',
          tone: 'plain',
          messageOverride: null,
        },
        serviceReady: false,
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
      }));
      window.localStorage.setItem('gg.sessions.v1', JSON.stringify(list));
    }

    it('lists both people on Home, newest first, and reopens whichever is picked at its draft', async () => {
      const user = userEvent.setup();
      seed([
        { name: 'Older Person', openedAt: '2026-01-01T00:00:00.000Z', step: 'announce' },
        { name: 'Newer Person', openedAt: '2026-02-01T00:00:00.000Z', step: 'announce' },
      ]);
      render(<App />);
      const names = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
      expect(names).toEqual(['Newer Person', 'Older Person']);
      await user.click(screen.getByRole('button', { name: 'Older Person' }));
      await resume(user);
      expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('note for Older Person');
    });

    it('resumes a draft saved on the retired service question on the people step', async () => {
      const user = userEvent.setup();
      seed([{ name: 'Margaret Hayes', openedAt: '2026-02-01T00:00:00.000Z', step: 'serviceKnown' }]);
      render(<App />);
      await openFromHome(user);
      await resume(user);
      expect(await screen.findByRole('heading', { name: 'Who should know?' })).toBeInTheDocument();
      expect(screen.queryByText('Do you know the service details?')).not.toBeInTheDocument();
    });

    it('opens the landing when the last message was already sent', async () => {
      const user = userEvent.setup();
      seed([{ name: 'Margaret Hayes', openedAt: '2026-02-01T00:00:00.000Z', step: 'sent' }]);
      render(<App />);
      await openFromHome(user);
      expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    });
  });
});
