/**
 * #112: Home is where the app lands and where the path returns. The real App over real
 * localStorage; a "reload" is an unmount and a fresh <App /> over the same storage.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft } from '@griever/hooks';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

function person(id: string, name: string, openedAt: string, drafts: Record<string, unknown> = {}) {
  return {
    id,
    personName: name,
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: openedAt,
    lastOpenedAt: openedAt,
    drafts,
    draftsUpdatedAt: Object.fromEntries(Object.keys(drafts).map((k) => [k, openedAt])),
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

function seed(...people: ReturnType<typeof person>[]) {
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify(people));
}

// Matches CONTACTS_CHECK_FALLBACK_MS in app.tsx: how long setup waits on the local contacts read.
const CONTACTS_CHECK_FALLBACK_MS = 1500;
const HOME = "Who you're writing about";

async function expectHome() {
  expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
}

describe('Home as the landing (#112)', () => {
  it('lands on Home with the saved person listed after a reload, path untouched', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const view = render(<App />);
    await expectHome();
    view.unmount();
    render(<App />);
    await expectHome();
    expect(screen.queryByRole('heading', { name: 'One thing at a time.' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    expect(screen.getByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
  });

  it('opens a person with a half-written message on the path, marked Started, and one tap resumes it', async () => {
    const user = userEvent.setup();
    const draft = freshDraft({
      templateCategory: 'announcement',
      step: 'announce',
      fields: { personalNote: 'kept as it was' },
    });
    seed(
      person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z', { announcement: draft }),
      person('s2', 'Harold Price', '2026-10-09T00:00:00.000Z'),
    );
    render(<App />);
    await expectHome();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    expect(await screen.findByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.getByText('Started')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByLabelText(/Anything you'd like to add/)).toHaveValue('kept as it was');
  });

  it('opens a person without a draft at the path even when another has one', async () => {
    const user = userEvent.setup();
    const draft = freshDraft({ templateCategory: 'announcement', step: 'announce' });
    seed(
      person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z', { announcement: draft }),
      person('s2', 'Harold Price', '2026-10-09T00:00:00.000Z'),
    );
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Harold Price' }));
    expect(await screen.findByText('For Harold Price')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeInTheDocument();
  });

  it('goes Back from the path to Home with focus on its heading', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const heading = await screen.findByRole('heading', { level: 1, name: HOME });
    expect(heading).toHaveFocus();
  });

  it('keeps Settings under Home and off the path, and shows no other-people list', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'), person('s2', 'Harold Price', '2026-10-09T00:00:00.000Z'));
    render(<App />);
    await expectHome();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    expect(screen.queryByText("Other people you're writing about")).not.toBeInTheDocument();
    expect(screen.queryByText('Harold Price')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Someone else I've lost" })).not.toBeInTheDocument();
  });

  async function createFromHome(user: User) {
    await user.click(await screen.findByRole('button', { name: "Someone else I've lost" }));
  }

  it('opens setup for a new person; Back from untouched setup prunes them and returns to Home', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await createFromHome(user);
    expect(await screen.findByRole('heading', { name: 'Who are we writing about?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await expectHome();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]')).toHaveLength(1);
  });

  it('makes no network call while moving between Home and the path (C5)', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
      render(<App />);
      await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await expectHome();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('never leaves a blank screen after a pruned setup: Settings, the checklist and Back', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await createFromHome(user);
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await expectHome();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('opens the checklist as a sheet over Settings, which stays', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: "What you'll need" }));
    expect(await screen.findByRole('dialog', { name: "What you'll need" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('opens the checklist as a sheet over Home, which stays', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await expectHome();
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await expectHome();
  });
});

describe('Create a new one walks setup, contacts, then who hears first (#113)', () => {
  const FIRST = "Start with someone I've lost";
  const sessionsInStorage = () => JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]') as { personName: string }[];

  async function heading(name: string) {
    return screen.findByRole('heading', { level: 1, name });
  }

  async function fillSetup(user: User, name: string) {
    await user.type(await screen.findByLabelText('Their name'), name);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
  }

  async function addOneContact(user: User) {
    await user.type(screen.getByLabelText('Name'), 'Aunt Carol');
    await user.type(screen.getByLabelText('Mobile number'), '6175550148');
    await user.click(screen.getByRole('button', { name: 'Add and start another' }));
    await screen.findByText('Added so far — 1');
  }

  it('first visit: setup, then adding contacts, then who hears first, then the new path', async () => {
    const user = userEvent.setup();
    render(<App />);
    await expectHome();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: FIRST }));
    expect(await heading('Who are we writing about?')).toBeInTheDocument();
    expect(screen.queryByLabelText(/obituary/i)).not.toBeInTheDocument(); // C10
    await fillSetup(user, 'Margaret Hayes');
    expect(await heading('Who should we be able to reach?')).toBeInTheDocument();
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    expect(await heading('Who should hear first?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await heading('One thing at a time.')).toBeInTheDocument();
    expect(screen.getByText('For Margaret Hayes')).toBeInTheDocument();
    // Back from the path lists the person just created.
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await expectHome();
    expect(screen.getByRole('button', { name: 'Margaret Hayes' })).toBeInTheDocument();
  });

  it('a second create skips adding contacts: setup, who hears first, path', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await heading('Who should we be able to reach?');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: "Someone else I've lost" }));
    await fillSetup(user, 'Harold Price');
    expect(await heading('Who should hear first?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Who should we be able to reach?' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    expect(await heading('One thing at a time.')).toBeInTheDocument();
    expect(screen.getByText('For Harold Price')).toBeInTheDocument();
  });

  it('Back goes one step at a time: path-bound steps return to contacts, then setup, then Home', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await heading('Who should hear first?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await heading('Who should we be able to reach?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await heading('Who are we writing about?')).toBeInTheDocument();
    expect(screen.getByLabelText('Their name')).toHaveValue('Margaret Hayes');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await expectHome();
    expect(sessionsInStorage()).toHaveLength(1); // a named person is kept
  });

  it('Back from who hears first goes to setup when contacts were skipped', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: "Someone else I've lost" }));
    await fillSetup(user, 'Harold Price');
    await heading('Who should hear first?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await heading('Who are we writing about?')).toBeInTheDocument();
  });

  it('Back from an untouched setup on a first visit returns to Home and lists nobody', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await heading('Who are we writing about?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await expectHome();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(sessionsInStorage()).toHaveLength(0);
  });

  it('saves who hears first on this device and does not make a second person', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Aunt Carol' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await heading('One thing at a time.');
    expect(sessionsInStorage()).toHaveLength(1);
    const { contactStore } = await import('@griever/data-local');
    expect((await contactStore.list()).map((c) => c.tier)).toEqual(['first']);
  });

  it('makes no network call while walking the whole order (C5)', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      render(<App />);
      await user.click(await screen.findByRole('button', { name: FIRST }));
      await fillSetup(user, 'Margaret Hayes');
      await addOneContact(user);
      await user.click(screen.getByRole('button', { name: 'Done for now' }));
      await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
      await heading('One thing at a time.');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens the checklist as a sheet in the walk, and closing it leaves the step as it was', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await heading('Who should we be able to reach?');
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(await heading('Who should we be able to reach?')).toBeInTheDocument();
  });

  it('keeps typed contact input and unsaved ticks across the checklist', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await heading('Who should we be able to reach?');
    await user.type(screen.getByLabelText('Name'), 'Uncle Joe');
    await user.type(screen.getByLabelText('Mobile number'), '617555');
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await heading('Who should we be able to reach?');
    expect(screen.getByLabelText('Name')).toHaveValue('Uncle Joe');
    expect(screen.getByLabelText('Mobile number')).toHaveValue('617555');

    await user.clear(screen.getByLabelText('Name'));
    await user.clear(screen.getByLabelText('Mobile number'));
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Aunt Carol' }));
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    await heading('Who should hear first?');
    expect(screen.getByRole('checkbox', { name: 'Aunt Carol' })).toBeChecked();
  });

  it('still reaches a step when the local contacts read never answers', async () => {
    const { contactStore } = await import('@griever/data-local');
    const spy = vi.spyOn(contactStore, 'list').mockImplementation(() => new Promise(() => undefined));
    // The app gives up on the read after 1.5 s. Hold back only that timer and fire it here, so
    // the test doesn't sleep through the wait (a real sleep stretches under load). Every other
    // timer runs as normal.
    let giveUp: (() => void) | undefined;
    const realSetTimeout = globalThis.setTimeout;
    const timers = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
      if (ms !== CONTACTS_CHECK_FALLBACK_MS) return realSetTimeout(fn, ms, ...args);
      giveUp = fn;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
    const user = userEvent.setup();
    try {
      render(<App />);
      await user.click(await screen.findByRole('button', { name: FIRST }));
      await fillSetup(user, 'Margaret Hayes');
      await waitFor(() => expect(giveUp).toBeDefined());
      expect(screen.queryByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).not.toBeInTheDocument();
      act(() => giveUp?.());
      expect(await screen.findByRole('heading', { level: 1, name: 'Who should we be able to reach?' })).toBeInTheDocument();
    } finally {
      timers.mockRestore();
      spy.mockRestore();
    }
  });

  it('Edit details from the path and Continue returns to the path, not the contacts walk', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    await heading('One thing at a time.');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    await heading('Edit their details');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await heading('One thing at a time.')).toBeInTheDocument();
  });

  it('Back from who hears first returns to the contacts view that was used', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: FIRST }));
    await fillSetup(user, 'Margaret Hayes');
    await addOneContact(user);
    await user.click(screen.getByRole('button', { name: 'Done for now' }));
    await heading('Who should hear first?');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await heading('Who should we be able to reach?')).toBeInTheDocument();
  });
});
