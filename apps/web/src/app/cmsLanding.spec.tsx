/**
 * #448: with the editor on, the app lands on the Overview (or The person) once per load or sign-in,
 * and "Change" and Back from Settings or Profile stay on Home. Real localStorage; the flag is mocked.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
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
  return { ...actual, getProfile: mocks.getProfile, getMembers: mocks.getMembers };
});

import { App } from './app';

const HOME = "Who you're writing about";
const CREATE = "Start with someone I've lost";
const ANOTHER = "Someone else I've lost";

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

function stored(): { id: string; lastOpenedAt: string }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

function h1(name: string) {
  return screen.findByRole('heading', { level: 1, name });
}

/** Lets any pending effect run, then checks Home is still showing (no bounce back). */
async function expectStaysOnHome() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
}

function signedInAs(accountType: 'owner' | 'member') {
  mocks.auth = true;
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: {
      id: 'u1',
      senderName: 'Anna',
      contactSource: null,
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
    expect(screen.getByText('Harold Price', { exact: true })).toBeInTheDocument();
    const harold = stored().find((s) => s.id === 's2');
    expect(Date.parse(harold?.lastOpenedAt ?? '')).toBeGreaterThan(Date.parse('2026-10-12T00:00:00.000Z'));
  });

  it('opens The person for a new person when nobody is saved (owner), focusing the h1', async () => {
    render(<App />);
    const heading = await h1('The person');
    await waitFor(() => expect(heading).toHaveFocus());
    expect(stored()).toHaveLength(1);
  });

  it('an owner with nobody saved can press Change, then "Start with someone I\'ve lost" (C11)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await h1('The person');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(HOME);
    await expectStaysOnHome();
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
    await h1(HOME);
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign in with the test provider' }));
    expect(await h1('Overview')).toBeInTheDocument();
  });

  it('opens The person for a signed-in owner with nobody saved', async () => {
    signedInAs('owner');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    render(<App />);
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('keeps a member with nothing shared on Home (C11)', async () => {
    signedInAs('member');
    mocks.sharing = true;
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    render(<App />);
    expect(await h1(HOME)).toBeInTheDocument();
    await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
    await expectStaysOnHome();
    expect(screen.queryByRole('button', { name: CREATE })).not.toBeInTheDocument();
    expect(stored()).toHaveLength(0);
  });

  it('gives up landing when the profile is unavailable, and does not jump later', async () => {
    signedInAs('owner');
    mocks.sharing = true;
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'unavailable' });
    mocks.getMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<App />);
      expect(await h1(HOME)).toBeInTheDocument();
      await waitFor(() => expect(mocks.getProfile).toHaveBeenCalled());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500);
      });
      expect(screen.getByRole('heading', { level: 1, name: HOME })).toBeInTheDocument();
      expect(stored()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Change" returns to Home and stays there, and Home can still create a person', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    const home = await h1(HOME);
    await waitFor(() => expect(home).toHaveFocus());
    await expectStaysOnHome();
    expect(screen.getByRole('button', { name: 'Margaret Hayes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: ANOTHER }));
    expect(await h1('The person')).toBeInTheDocument();
  });

  it('Back from Settings returns to Home and stays there', async () => {
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: /Change/ }));
    await h1(HOME);
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await h1('Settings');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await h1(HOME)).toBeInTheDocument();
    await expectStaysOnHome();
  });

  it('Back from Your account returns to Home and stays there', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    await h1('Overview');
    await user.click(screen.getByRole('button', { name: 'Your account' }));
    await h1('Your account');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await h1(HOME)).toBeInTheDocument();
    await expectStaysOnHome();
  });

  it('with the editor off, loads on Home as before', async () => {
    mocks.cms = false;
    seed(person('s1', 'Margaret Hayes', '2026-10-10T00:00:00.000Z'));
    render(<App />);
    expect(await h1(HOME)).toBeInTheDocument();
    await expectStaysOnHome();
  });
});
