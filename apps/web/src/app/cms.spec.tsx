/**
 * #395: the web editor wired into the real App behind CMS_ENABLED. Real localStorage; a "remount" is
 * an unmount and a fresh <App /> over the same storage. The flag is mocked per test.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  cms: true,
  auth: false,
  sharing: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
  updateProfile: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  get AUTH_ENABLED() {
    return mocks.auth;
  },
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  get SHARING_ENABLED() {
    return mocks.sharing;
  },
}));
vi.mock('../lib/cmsFlag', () => ({
  get CMS_ENABLED() {
    return mocks.cms;
  },
}));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers, updateProfile: mocks.updateProfile,
    createInvite: mocks.createInvite,
    revokeInvite: mocks.revokeInvite,
  };
});

import { App } from './app';

const PEOPLE = 'Your people';
const HOME = "Who you're writing about";
const CREATE = "Start with someone I've lost";

function person(id: string, name: string, openedAt: string) {
  return {
    id,
    personName: name,
    dateOfPassing: '',
    senderName: 'Anna',
    obituaryUrl: '',
    createdAt: openedAt,
    lastOpenedAt: openedAt,
    drafts: {},
    draftsUpdatedAt: {},
    serviceReady: false,
    recipientsNotified: {},
    momentCompletedAt: {},
    remindersScheduled: [],
  };
}

function seed(...people: ReturnType<typeof person>[]) {
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify(people));
}

function stored(): { id: string; personName: string; lastOpenedAt: string; sectionStatus?: Record<string, string>; announcementMessage?: string }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

async function expectHome() {
  expect(await screen.findByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
}

async function expectPeople() {
  expect(await screen.findByRole('heading', { level: 1, name: PEOPLE })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: HOME })).not.toBeInTheDocument();
}

/** Loading with one saved person lands on their Overview (#448). */
async function openMargaret() {
  seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
  render(<App />);
  return screen.findByRole('heading', { level: 1, name: 'Overview' });
}

beforeEach(() => {
  mocks.cms = true;
  mocks.auth = false;
  mocks.sharing = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getMembers.mockReset();
  mocks.updateProfile.mockReset();
  mocks.createInvite.mockReset();
  mocks.revokeInvite.mockReset();
  window.localStorage.clear();
});

/** One banner, one nav, one main and one side panel: the standard layout (#584). */
function expectOneEditorLayout() {
  expect(screen.getAllByRole('banner')).toHaveLength(1);
  expect(screen.getAllByRole('navigation', { name: /^Sections/ })).toHaveLength(1);
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('complementary')).toHaveLength(1);
}

describe('editor on (#395)', () => {
  it('opens a person on their Overview and records the visit', async () => {
    await openMargaret();
    expect(screen.queryByRole('heading', { name: 'One thing at a time.' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Now: .*On the checklist:/ })).toBeInTheDocument();
    expect(Date.parse(stored()[0].lastOpenedAt)).toBeGreaterThan(Date.parse('2026-10-10T00:00:00.000Z'));
  });

  it('"Create a new one" opens The person directly, and a typed name survives a remount', async () => {
    const user = userEvent.setup();
    const view = render(<App />);
    // Nobody saved: loading opens Your people (#566); starting a person is the user's choice.
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    expect(await screen.findByRole('heading', { level: 1, name: 'The person' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /contacts|who hears first/i })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Their name'), 'Harold Price');
    view.unmount();
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /^Change who/ }));
    await expectPeople();
    expect(screen.getByRole('button', { name: 'Harold Price' })).toBeInTheDocument();
    expect(stored()[0].sectionStatus).toEqual({ person: 'in_progress' });
  });

  it('marking Service ready shows Ready on the Overview', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0].sectionStatus).toEqual({ service: 'ready' });
    await user.click(screen.getByRole('button', { name: /^Overview/ }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ })).toHaveTextContent('Ready');
  });

  it('Ready leads on: Next opens Announcement with focus on its h1, then Service, then Obituary', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^The person/ }));
    await screen.findByRole('heading', { level: 1, name: 'The person' });
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    await user.click(screen.getByRole('button', { name: 'Next: Announcement' }));
    const focused1 = await screen.findByRole('heading', { level: 1, name: 'Announcement' });
    await waitFor(() => expect(focused1).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    await user.click(screen.getByRole('button', { name: 'Next: Service' }));
    const focused2 = await screen.findByRole('heading', { level: 1, name: 'Service' });
    await waitFor(() => expect(focused2).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    await user.click(screen.getByRole('button', { name: 'Next: Obituary' }));
    const focused3 = await screen.findByRole('heading', { level: 1, name: 'Obituary' });
    await waitFor(() => expect(focused3).toHaveFocus());
  });

  it('Service ready leads back: Next: The person focuses The person h1', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    await user.click(screen.getByRole('button', { name: 'Next: The person' }));
    const focused4 = await screen.findByRole('heading', { level: 1, name: 'The person' });
    await waitFor(() => expect(focused4).toHaveFocus());
  });

  it('"Change" returns to Home and drops an unnamed person', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await screen.findByRole('heading', { level: 1, name: 'The person' });
    expect(stored()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /^Change who/ }));
    await expectPeople();
    expect(screen.getByRole('heading', { level: 1, name: PEOPLE })).toHaveFocus();
    expect(stored()).toHaveLength(0);
  });

  it('"Change" keeps an unnamed person who has service data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: "Start with someone I've lost" }));
    await screen.findByRole('heading', { level: 1, name: 'The person' });
    await user.click(screen.getByRole('button', { name: 'Service' }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.type(screen.getAllByLabelText('Date')[0], 'May 29, 2026');
    await user.click(screen.getByRole('button', { name: /^Change who/ }));
    await expectPeople();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].personName).toBe('');
  });

  it('taking "Mark as ready" back on Service sets In progress and clears serviceReady', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    await screen.findByRole('heading', { level: 1, name: 'Service' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0]).toMatchObject({ serviceReady: true });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0].sectionStatus?.['service']).toBe('in_progress');
    expect(stored()[0]).toMatchObject({ serviceReady: false });
  });

  it('"Change" keeps a named person', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(screen.getByRole('button', { name: /^Change who/ }));
    await expectPeople();
    expect(stored()).toHaveLength(1);
  });

  it('lists Announcement, Obituary and Thank-yous in the nav as buttons that open their editors', async () => {
    const user = userEvent.setup();
    await openMargaret();
    for (const name of ['Announcement', 'Obituary', 'Thank-yous']) {
      const nav = within(screen.getByRole('navigation', { name: /^Sections/ }));
      await user.click(nav.getByRole('button', { name: new RegExp(`^${name}`) }));
      const focused5 = await screen.findByRole('heading', { level: 1, name });
      await waitFor(() => expect(focused5).toHaveFocus());
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.queryByText(/comes later/i)).not.toBeInTheDocument();
    }
  });

  it('saves an edited announcement, marks it ready and shows it on the Overview', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Announcement/ }));
    await screen.findByRole('heading', { level: 1, name: 'Announcement' });
    const message = screen.getByRole('textbox', { name: 'Message' });
    await user.clear(message);
    await user.type(message, 'Margaret died peacefully.');
    expect(stored()[0].announcementMessage).toBe('Margaret died peacefully.');
    expect(stored()[0].sectionStatus).toEqual({ announcement: 'in_progress' });
    await user.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(stored()[0].sectionStatus).toEqual({ announcement: 'ready' });
    await user.click(screen.getByRole('button', { name: /^Overview/ }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    expect(within(screen.getByRole('main')).getByRole('button', { name: /^Announcement/ })).toHaveTextContent(
      'Ready Margaret died peacefully.',
    );
  });

  it('reaches no path, wizard, sms: link or "Open Messages" from any section', async () => {
    const user = userEvent.setup();
    await openMargaret();
    for (const name of ['Overview', 'Announcement', 'Service', 'Obituary', 'Thank-yous']) {
      await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name }));
      await screen.findByRole('heading', { level: 1, name });
      expect(document.querySelector('a[href^="sms:"]')).toBeNull();
      expect(screen.queryByText(/Open Messages/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'One thing at a time.' })).not.toBeInTheDocument();
    }
  });

  it('moves focus to the h1 when an Overview card opens a section', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(within(screen.getByRole('main')).getByRole('button', { name: /^Service/ }));
    const focused6 = await screen.findByRole('heading', { level: 1, name: 'Service' });
    await waitFor(() => expect(focused6).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /^Overview/ }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(
      within(screen.getByRole('main')).getByRole('button', { name: /^The person Not started .*Continue$/ }),
    );
    const focused7 = await screen.findByRole('heading', { level: 1, name: 'The person' });
    await waitFor(() => expect(focused7).toHaveFocus());
  });

  it('"Your account" opens the settings content when nobody is signed in, inside the editor, and the nav returns to the Overview', async () => {
    const user = userEvent.setup();
    await openMargaret();
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    const focused8 = await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await waitFor(() => expect(focused8).toHaveFocus());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove everything from this device' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Overview/ }));
    const focused9 = await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(focused9).toHaveFocus());
  });
});

describe('editor on, signed in (#395)', () => {
  function signedInAs(accountType: 'owner' | 'member') {
    mocks.auth = true;
    mocks.getProfile.mockResolvedValue({
      ok: true,
      profile: {
        id: 'u1',
        senderName: 'Anna',
        contactSource: null,
        firstName: null,
        lastName: null,
        fullName: null,
        birthDate: null,
        address: null,
        accountType,
        createdAt: '2026-10-11T00:00:00.000Z',
        updatedAt: '2026-10-11T00:00:00.000Z',
      },
    });
    mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1' }).load);
  }

  it('"Your account" opens the profile inside the editor, and the nav returns to the Overview', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    const focused10 = await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await waitFor(() => expect(focused10).toHaveFocus());
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('button', { name: /^Overview/ }));
    const focused11 = await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await waitFor(() => expect(focused11).toHaveFocus());
  });

  it('saving details for a sender-name-only account sends the prefilled first name, never a blank one', async () => {
    signedInAs('owner');
    mocks.updateProfile.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', senderName: 'Anna', contactSource: null, firstName: null, lastName: null, fullName: null, birthDate: '1980-05-29', address: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
    });
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Your details are saved.')).toBeInTheDocument();
    const body = mocks.updateProfile.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toEqual({ firstName: 'Anna', lastName: null, birthDate: null, address: null });
  });

  async function openYourAccount(user: ReturnType<typeof userEvent.setup>) {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Margaret Hayes' }));
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
  }

  it('Save details waits, with a loading line, while the profile call is unanswered', async () => {
    signedInAs('owner');
    mocks.getProfile.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    await openYourAccount(user);
    expect(screen.getByRole('button', { name: 'Save details' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Loading your details.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it('a failed profile load does not lock Save details', async () => {
    signedInAs('owner');
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const user = userEvent.setup();
    await openYourAccount(user);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save details' })).not.toHaveAttribute('aria-disabled', 'true'));
    expect(screen.queryByText('Loading your details.')).not.toBeInTheDocument();
  });

  it('an account with no name gets the name prompt inside the editor, and saving returns to where they were', async () => {
    mocks.auth = true;
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'no_profile' });
    mocks.updateProfile.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', senderName: 'Anna Reyes', contactSource: null, firstName: null, lastName: null, fullName: null, birthDate: null, address: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
    });
    mocks.loadClerk.mockResolvedValue(fakeClerk().load);
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    // The name check runs on sign-in, so sign in rather than start signed in.
    await user.click(await screen.findByRole('button', { name: 'Sign in with the test provider' }));
    const askHeading = await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    await waitFor(() => expect(askHeading).toHaveFocus());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: /^Sections/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expectOneEditorLayout();
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: "What you'll need" })).toBeInTheDocument();
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.type(screen.getByLabelText('Last name (optional)'), 'Reyes');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(mocks.updateProfile).toHaveBeenCalledWith(expect.anything(), { firstName: 'Anna', lastName: 'Reyes' });
    const sent = mocks.updateProfile.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('birthDate');
    expect(sent).not.toHaveProperty('address');
    // Back to where they were: the editor they came from, not the account.
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.queryByLabelText('First name')).not.toBeInTheDocument();
  });

  it('a brand-new user: name prompt in the shell with a calm panel, then Your people with the same layout', async () => {
    mocks.auth = true;
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'no_profile' });
    mocks.updateProfile.mockResolvedValue({
      ok: true,
      profile: { id: 'u1', senderName: 'Anna Reyes', contactSource: null, firstName: null, lastName: null, fullName: null, birthDate: null, address: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
    });
    mocks.loadClerk.mockResolvedValue(fakeClerk().load);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Sign in with the test provider' }));
    await screen.findByRole('heading', { level: 1, name: 'What should we call you?' });
    expectOneEditorLayout();
    expect(within(screen.getByRole('complementary')).getByText(/When you open someone on Your people/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.type(screen.getByLabelText('Last name (optional)'), 'Reyes');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your people' })).toBeInTheDocument();
    expectOneEditorLayout();
    expect(within(screen.getByRole('complementary')).getByText(/When you open someone on Your people/)).toBeInTheDocument();
  });

  it('Your account with a person shows the checklist panel and the nav', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    expectOneEditorLayout();
    expect(within(screen.getByRole('complementary')).getByRole('heading', { name: "What you'll need" })).toBeInTheDocument();
    expect(within(screen.getByRole('complementary')).queryByText(/When you open someone on Your people/)).not.toBeInTheDocument();
  });

  it('with two people: a panel item on Your account opens that person at the item, and Back returns to Your account', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'), person('s2', 'Thomas Hale', '2026-10-01T00:00:00.000Z'));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /^Change/ }));
    await screen.findByRole('heading', { level: 1, name: 'Your people' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    const panel = within(screen.getByRole('complementary'));
    const item = panel.getAllByRole('button', { name: /pronouncement/i })[0];
    await user.click(item);
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent(/pronouncement/i);
    expect(screen.getAllByText('Margaret Hayes').length).toBeGreaterThan(0);
    expect(screen.queryByText('Thomas Hale')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
  });

  it('Sign out works from inside the editor', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Sign in with the test provider' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Your account' })).not.toBeInTheDocument();
  });

  it('sends and cancels an invitation from inside the editor', async () => {
    mocks.sharing = true;
    const invite = { id: 'i1', email: 'sam@example.com', expiresAt: '2026-11-30T00:00:00.000Z' };
    mocks.getMembers
      .mockResolvedValueOnce({ ok: true, view: { role: 'owner', members: [], invites: [] } })
      .mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [invite] } });
    mocks.createInvite.mockResolvedValue({ ok: true });
    mocks.revokeInvite.mockResolvedValue({ ok: true });
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Overview' });
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    await screen.findByRole('heading', { name: 'People helping you' });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Their email'), 'Sam@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    await waitFor(() => expect(mocks.createInvite).toHaveBeenCalledWith(expect.anything(), 'sam@example.com'));
    await user.click(await screen.findByRole('button', { name: /Cancel this invitation/ }));
    await waitFor(() => expect(mocks.revokeInvite).toHaveBeenCalledWith(expect.anything(), 'i1'));
  });

  it('a member has no "Create a new one"', async () => {
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    signedInAs('member');
    render(<App />);
    await screen.findByRole('button', { name: 'Your account' });
    await waitFor(() => expect(screen.queryByRole('button', { name: CREATE })).not.toBeInTheDocument());
  });

  it('an owner with nobody saved lands on Your people', async () => {
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    signedInAs('owner');
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your people' })).toBeInTheDocument();
  });
});

describe('editor off (#395)', () => {
  it('opens the path from Home, as before', async () => {
    mocks.cms = false;
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await expectHome();
    await user.click(screen.getByRole('button', { name: 'Margaret Hayes' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'One thing at a time.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).not.toBeInTheDocument();
  });
});
