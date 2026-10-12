/**
 * #112: Home is where the app lands and where the path returns. The real App over real
 * localStorage; a "reload" is an unmount and a fresh <App /> over the same storage.
 */
import { render, screen } from '@testing-library/react';
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

const HOME = "The people you're writing about";

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

  it('opens a person with a half-written message at that message', async () => {
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
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('returns the checklist to Settings when it was opened from Settings', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('returns the checklist to Home when it was opened from Home', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await expectHome();
    await user.click(screen.getByRole('button', { name: "What you'll need" }));
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    await expectHome();
  });
});
