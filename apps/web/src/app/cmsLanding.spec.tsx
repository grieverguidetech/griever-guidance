/**
 * #448: with the editor on, the app lands on the Overview (or The person) once per load or sign-in,
 * and "Change" opens "Your people" and stays there; Back from Settings or Profile returns to the Overview (#451). Real localStorage; the flag is mocked.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ClerkLoadResult } from '../lib/authClient';
import type { Session } from '@griever/hooks';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  cms: true,
  auth: false,
  sharing: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
  sessions: null as null | { removeSession: (id: string) => boolean },
}));

// Passes through, and keeps the latest sessions handle so a test can remove a person.
vi.mock('@griever/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/hooks')>();
  return {
    ...actual,
    useSessions: (...args: Parameters<typeof actual.useSessions>) => {
      const result = actual.useSessions(...args);
      mocks.sessions = result;
      return result;
    },
  };
});

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
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers };
});

import { App } from './app';

const PEOPLE = 'Your people';
const HOME = "Who you're writing about";
const CREATE = "Start with someone I've lost";
const ANOTHER = "Someone else I've lost";

function person(id: string, name: string, openedAt: string, extra: Partial<Session> = {}) {
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
    ...extra,
  };
}

function seed(...people: ReturnType<typeof person>[]) {
  window.localStorage.setItem('gg.sessions.v1', JSON.stringify(people));
}

function stored(): { id: string; lastOpenedAt: string }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

/** Flag off: lets any pending effect run, then checks Home is still showing (no bounce back). */
async function expectStaysOnHome() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
}

/** Lets any pending effect run, then checks "Your people" is still showing (no bounce back). */
async function expectStaysOnPeople() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole('heading', { level: 1, name: PEOPLE })).toBeInTheDocument();
}

function signedInAs(accountType: 'owner' | 'member') {
  mocks.auth = true;
  // The device list is already kept for this account, as it is after any earlier sign-in.
  localStorage.setItem('gg.sessionsAccount.v1', 'u1');
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: {
      id: 'u1',
      senderName: 'Anna',
      contactSource: null,
      fullName: null,
      birthDate: null,
      accountType,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
    },
  });
  const clerk = fakeClerk({ userId: 'u1' });
  mocks.loadClerk.mockResolvedValue(clerk.load);
  return clerk;
}

beforeEach(() => {
  mocks.cms = true;
  mocks.auth = false;
  mocks.sharing = false;
  mocks.loadClerk.mockReset();
  mocks.getProfile.mockReset();
  mocks.getMembers.mockReset();
  window.localStorage.clear();
});

describe('landing with the editor on (#448)', () => {
  it('opens the most recently touched person\'s Overview, records the visit and focuses the h1', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'), person('s2', 'Harold Price', '2026-10-12T00:00:00.000Z'));
    render(<App />);
    const heading = await h1('Overview');
    await waitFor(() => expect(heading).toHaveFocus());
    // The name shows in the shell header and in The person card summary.
    expect(screen.getAllByText('Harold Price', { exact: true })).toHaveLength(2);
    const harold = stored().find((s) => s.id === 's2');
    expect(Date.parse(harold?.lastOpenedAt ?? '')).toBeGreaterThan(Date.parse('2026-10-12T00:00:00.000Z'));
  });

  it('reopens an unnamed person who has work, instead of making a blank one', async () => {
    seed(person('s1', '', '2026-10-10T00:00:00.000Z', { servicePlace: 'Oak Hill' }));
    render(<App />);
    expect(await h1('Overview')).toBeInTheDocument();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].id).toBe('s1');
  });

  it('after Change, an unnamed person with a checklist tick is listed and kept', async () => {
    const user = userEvent.setup();
    seed(person('s1', '', '2026-10-10T12:00:00.000Z', { checklist: { headstone: 'done' } }));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(PEOPLE);
    expect(screen.getByRole('button', { name: 'Not named yet, started Oct 10' })).toBeInTheDocument();
    expect(stored()).toHaveLength(1);
  });

  it('lists a shared (member) person with no name but a service place, and lands without making a blank one', async () => {
    signedInAs('member');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    seed(person('s1', '', '2026-10-10T12:00:00.000Z', { servicePlace: 'Oak Hill', role: 'member', ownerId: 'o1' }));
    render(<App />);
    expect(await h1('Overview')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stored()).toHaveLength(1);
    expect(stored()[0].id).toBe('s1');
  });

  it('opens Your people when nobody is saved (owner), focusing the h1, and creates no one', async () => {
    render(<App />);
    const heading = await h1(PEOPLE);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('button', { name: CREATE })).toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('an owner with nobody saved can press "Start with someone I\'ve lost" on Your people (C11)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1(PEOPLE);
    await expectStaysOnPeople();
    await user.click(screen.getByRole('button', { name: CREATE }));
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('lands after sign-in too, on the Overview', async () => {
    signedInAs('owner');
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    const heading = await h1('Overview');
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('lands again after signing out and back in', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(PEOPLE);
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in with the test provider' }));
    expect(await h1('Overview')).toBeInTheDocument();
  });

  it('opens Your people for a signed-in owner with nobody saved', async () => {
    signedInAs('owner');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    render(<App />);
    expect(await h1(PEOPLE)).toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('lands a member with nothing shared on "Your people", with the empty-state copy and no create button (C11)', async () => {
    signedInAs('member');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    render(<App />);
    expect(await h1(PEOPLE)).toBeInTheDocument();
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    await expectStaysOnPeople();
    expect(screen.queryByRole('button', { name: CREATE })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: ANOTHER })).not.toBeInTheDocument();
    expect(screen.getByText("When someone adds you to help, the people you're helping will show here.")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: HOME })).not.toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('lands on "Your people" when the profile is unavailable, and does not jump later', async () => {
    signedInAs('owner');
    mocks.sharing = true;
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'unavailable' });
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    render(<App />);
    expect(await h1(PEOPLE)).toBeInTheDocument();
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    await expectStaysOnPeople();
    expect(stored()).toHaveLength(0);
  });

  it('"Change" returns to Home and stays there, and Home can still create a person', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    const home = await h1(PEOPLE);
    await waitFor(() => expect(home).toHaveFocus());
    await expectStaysOnPeople();
    expect(screen.getByRole('button', { name: 'Margaret Hayes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ANOTHER }));
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('in "Your people" the nav offers Your people and Your account, under the one h1', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(PEOPLE);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Your people', 'Your account']);
    expect(within(nav).getByRole('button', { name: PEOPLE })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /Change/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(within(nav).getByRole('button', { name: 'Your account' }));
    expect(await h1('Your account')).toHaveFocus();
  });

  it('Your account opened from "Your people" shows the full nav for the most recent person, and Change returns to "Your people"', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(PEOPLE);
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('button', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('button', { name: /^Overview/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Change/ }));
    const people = await h1(PEOPLE);
    await waitFor(() => expect(people).toHaveFocus());
    await expectStaysOnPeople();
    expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).not.toBeInTheDocument();
  });

  it('with no person, Your account offers only Your people, which returns to the list and creates nothing (C11)', async () => {
    signedInAs('member');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    const user = userEvent.setup();
    render(<App />);
    await h1(PEOPLE);
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByRole('button', { name: /^Overview/ })).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: PEOPLE }));
    expect(await h1(PEOPLE)).toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('a section chosen in Your account opens the most recent person', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'), person('s2', 'Robert Hayes', '2026-10-20T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(PEOPLE);
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(screen.getByText('Robert Hayes')).toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: /^Overview/ }));
    expect(await h1('Overview')).toHaveFocus();
    expect(screen.getAllByText('Robert Hayes').length).toBeGreaterThan(0);
    expect(screen.queryByText('Margaret Hayes')).not.toBeInTheDocument();
  });

  it('Leaving Settings opened from an Overview returns to that Overview, through the side nav', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('button', { name: 'Your account' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: /^Overview/ }));
    expect(await h1('Overview')).toBeInTheDocument();
  });

  it('shows "Your people", never the old Home, before the profile arrives', async () => {
    signedInAs('owner');
    mocks.sharing = true;
    let resolveProfile: (value: unknown) => void = () => undefined;
    mocks.getProfile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    render(<App />);
    expect(await h1(PEOPLE)).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: HOME })).not.toBeInTheDocument();
    await act(async () => {
      resolveProfile({
        ok: true,
        profile: { id: 'u1', senderName: 'Anna', contactSource: null, fullName: null, birthDate: null, accountType: 'owner', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z' },
      });
    });
    expect(screen.getByRole('heading', { level: 1, name: PEOPLE })).toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('never renders the old Home when the open person disappears', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    // The person is removed under the editor: the render that has no person must not be the old Home.
    act(() => {
      mocks.sessions?.removeSession('s1');
    });
    expect(screen.queryByRole('heading', { name: HOME })).not.toBeInTheDocument();
    expect(await h1(PEOPLE)).toBeInTheDocument();
  });

  it('Leaving Your account returns to the Overview of the open person, through the side nav', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: /^Overview/ }));
    expect(await h1('Overview')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: PEOPLE })).not.toBeInTheDocument();
  });

  it('with the editor off, loads on Home as before', async () => {
    mocks.cms = false;
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    expect(await h1(HOME)).toBeInTheDocument();
    await expectStaysOnHome();
    expect(screen.queryByRole('heading', { level: 1, name: PEOPLE })).not.toBeInTheDocument();
  });
});

describe('navigation (#566)', () => {
  it('shows the logo header, and the people screen has the side nav with Your people current', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    expect(screen.getByRole('banner')).toHaveTextContent('Grievers Guidance');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: PEOPLE }));
    await h1(PEOPLE);
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).getByRole('button', { name: PEOPLE })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('keeps the side nav on Your account after going to another screen and back', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    const sections = () => screen.getByRole('navigation', { name: 'Sections' });
    await user.click(within(sections()).getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    expect(within(sections()).getByRole('button', { name: /^Overview/ })).toBeInTheDocument();
    await user.click(within(sections()).getByRole('button', { name: /^Service/ }));
    await h1('Service');
    await user.click(within(sections()).getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    expect(within(sections()).getByRole('button', { name: PEOPLE })).toBeInTheDocument();
    expect(within(sections()).getByRole('button', { name: /^Overview/ })).toBeInTheDocument();
    expect(within(sections()).queryByRole('button', { name: /^The person/ })).toBeNull();
  });

  it('shows no status words in the side nav, only icons with names', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z', { sectionStatus: { service: 'ready' } }));
    render(<App />);
    await h1('Overview');
    const nav = screen.getByRole('navigation', { name: 'Sections' });
    expect(within(nav).queryByText('Not started')).toBeNull();
    expect(within(nav).queryByText('Ready')).toBeNull();
    expect(within(nav).getByRole('img', { name: 'Ready' })).toBeInTheDocument();
    expect(within(nav).getAllByRole('img', { name: 'Not started' }).length).toBeGreaterThan(0);
  });

  it('Back from the first editor screen goes past the sign-in entries and never pushes or shows the sign-in', async () => {
    // Entries before ours stand for Clerk's hash steps: no state of ours.
    window.history.replaceState(null, '');
    window.history.pushState(null, '');
    window.history.pushState(null, '');
    signedInAs('owner');
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: /^Service/ }));
    await h1('Service');
    const back = vi.spyOn(window.history, 'back');
    const push = vi.spyOn(window.history, 'pushState');
    act(() => {
      window.history.back();
    });
    const overview = await h1('Overview');
    await waitFor(() => expect(overview).toHaveFocus());
    back.mockClear();
    // Back again lands on the first sign-in step: the app walks on by itself, to the next one and past it.
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(back.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Let the last traversal finish, so it cannot leak into the next test.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign in with the test provider')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    back.mockRestore();
    push.mockRestore();
  });

  describe.each([
    ['Your account', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: 'Your account' }));
    }, 'Your account'],
    ['Your people', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: PEOPLE }));
    }, PEOPLE],
    ['a section', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: /^Service/ }));
    }, 'Service'],
  ])('Back then Forward on %s', (_label, go, heading) => {
    it('returns to Overview, then comes back to the screen, with focus on the h1', async () => {
      seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
      const user = userEvent.setup();
      render(<App />);
      await h1('Overview');
      await go(user);
      await h1(heading);
      act(() => {
        window.history.back();
      });
      const overview = await h1('Overview');
      await waitFor(() => expect(overview).toHaveFocus());
      act(() => {
        window.history.forward();
      });
      const again = await h1(heading);
      await waitFor(() => expect(again).toHaveFocus());
      expect(screen.getByRole('navigation', { name: 'Sections' })).toBeInTheDocument();
    });
  });

  it('Back then Forward on Settings (signed out, flag on) returns to it', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    expect(screen.getByRole('button', { name: 'Remove everything from this device' })).toBeInTheDocument();
    act(() => {
      window.history.back();
    });
    await h1('Overview');
    act(() => {
      window.history.forward();
    });
    expect(await h1('Your account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove everything from this device' })).toBeInTheDocument();
  });

  it('Back then Forward on the Profile (signed in) returns to it, never to the name prompt', async () => {
    signedInAs('owner');
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    await user.click(within(screen.getByRole('navigation', { name: 'Sections' })).getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    act(() => {
      window.history.back();
    });
    await h1('Overview');
    act(() => {
      window.history.forward();
    });
    expect(await h1('Your account')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /name/i })).toBeNull();
  });

  it('Back then Forward on a checklist item returns to it, and Back lands focus on what opened it', async () => {
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    const user = userEvent.setup();
    render(<App />);
    await h1('Overview');
    const opener = document.querySelector<HTMLElement>('main [data-checklist-item]');
    expect(opener).not.toBeNull();
    const itemId = opener?.getAttribute('data-checklist-item') ?? '';
    await user.click(opener as HTMLElement);
    await waitFor(() => expect(document.querySelector('h1')?.textContent).not.toBe('Overview'));
    const itemTitle = document.querySelector('h1')?.textContent ?? '';
    act(() => {
      window.history.back();
    });
    await h1('Overview');
    await waitFor(() => expect(document.querySelector(`[data-checklist-item="${itemId}"]`)).toHaveFocus());
    act(() => {
      window.history.forward();
    });
    expect(await h1(itemTitle)).toBeInTheDocument();
  });
});
