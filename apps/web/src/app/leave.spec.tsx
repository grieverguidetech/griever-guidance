/**
 * #223: a member stops helping from the account page, wired into the real App with the editor, sync
 * and sharing on. Clerk is fake and the api-client is stubbed, so there is no network. Real localStorage.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import userEvent from '@testing-library/user-event';
import type { FlowRecord, MembersView } from '@griever/shared';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const USER = 'u1';
const OWNER = 'o1';
const FLOW = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  /** True once the server has accepted the leave. */
  left: false,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
  leaveMembership: vi.fn(),
  listFlows: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  AUTH_ENABLED: true,
  OBITUARY_DRAFTING_ENABLED: false,
  PAYMENTS_ENABLED: false,
  SHARING_ENABLED: true,
}));
vi.mock('../lib/cmsFlag', () => ({ CMS_ENABLED: true }));
vi.mock('../lib/syncFlag', () => ({ SYNC_ENABLED: true }));
vi.mock('../lib/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/authClient')>();
  return { ...actual, loadClerk: mocks.loadClerk };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return {
    ...actual,
    getProfile: mocks.getProfile,
    getMembers: mocks.getMembers,
    leaveMembership: mocks.leaveMembership,
    listFlows: mocks.listFlows,
  };
});

import { App } from './app';

const CREATE = "Start with someone I've lost";
const MEMBER_VIEW: MembersView = { role: 'member', owner: { id: OWNER, name: 'Anna' } };
const OWNER_VIEW: MembersView = { role: 'owner', members: [], invites: [] };

const SHARED: FlowRecord = {
  id: FLOW,
  ownerId: OWNER,
  role: 'member',
  facts: {
    personName: 'Margaret Hayes',
    dateOfPassing: null,
    serviceDate: null,
    obituaryUrl: null,
    obituaryPublisher: null,
    serviceReady: false,
  },
  updatedAt: '2026-10-01T00:00:00.000Z',
  updatedBy: null,
};

function profile(accountType: 'owner' | 'member') {
  return {
    id: USER,
    senderName: 'Ben',
    contactSource: null,
    firstName: null,
    lastName: null,
    fullName: null,
    birthDate: null,
    address: null,
    accountType,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
}

/** The shared person is already on this device, with a draft the member started. */
function seedShared() {
  window.localStorage.setItem(
    'gg.sessions.v1',
    JSON.stringify([
      {
        id: 's1',
        flowId: FLOW,
        ownerId: OWNER,
        role: 'member',
        personName: 'Margaret Hayes',
        dateOfPassing: '',
        senderName: 'Ben',
        obituaryUrl: '',
        createdAt: '2026-10-10T00:00:00.000Z',
        lastOpenedAt: '2026-10-10T00:00:00.000Z',
        drafts: { family: { step: 'compose', message: 'Dear all' } },
        draftsUpdatedAt: {},
        serviceReady: false,
        recipientsNotified: {},
        momentCompletedAt: {},
        remindersScheduled: [],
      },
    ]),
  );
}

function stored(): { flowId?: string; role?: string }[] {
  return JSON.parse(window.localStorage.getItem('gg.sessions.v1') ?? '[]');
}

beforeEach(() => {
  mocks.left = false;
  window.localStorage.clear();
  for (const m of [mocks.loadClerk, mocks.getProfile, mocks.getMembers, mocks.leaveMembership, mocks.listFlows]) {
    m.mockReset();
  }
  // The server's answers change once the leave is accepted.
  mocks.getProfile.mockImplementation(async () => ({ ok: true, profile: profile(mocks.left ? 'owner' : 'member') }));
  mocks.getMembers.mockImplementation(async () => ({ ok: true, view: mocks.left ? OWNER_VIEW : MEMBER_VIEW }));
  mocks.listFlows.mockImplementation(async () => ({ ok: true, flows: mocks.left ? [] : [SHARED], dropped: 0 }));
  mocks.leaveMembership.mockImplementation(async () => {
    mocks.left = true;
    return { ok: true };
  });
  mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: USER }).load);
  seedShared();
});

async function openAccount(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { level: 1, name: 'Overview' });
  // The first pull has run, so the shared person is confirmed by the server.
  await waitFor(() => expect(mocks.listFlows).toHaveBeenCalled());
  await user.click(screen.getByRole('link', { name: 'Your account' }));
  await screen.findByRole('heading', { level: 1, name: 'Account' });
  return screen.findByRole('button', { name: 'Stop helping Anna' });
}

async function openYourPeople(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(screen.getByRole('navigation', { name: /^Sections/ })).getByRole('link', { name: "Who you've lost" }));
  await screen.findByRole('heading', { level: 1, name: "Who you've lost" });
}

describe('stop helping (#223)', () => {
  it('leaves once, then a pull takes the shared people off Home, and "Create a new one" is back', async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await openAccount(user));
    expect(await screen.findByRole('heading', { name: 'Stop helping Anna?' })).toHaveFocus();
    const pullsBefore = mocks.listFlows.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Stop helping' }));

    await waitFor(() => expect(mocks.leaveMembership).toHaveBeenCalledTimes(1));
    expect(mocks.leaveMembership).toHaveBeenCalledWith('tok');
    await waitFor(() => expect(mocks.listFlows.mock.calls.length).toBeGreaterThan(pullsBefore));
    // The shared person and their draft are gone from this device.
    await waitFor(() => expect(stored().some((s) => s.flowId === FLOW)).toBe(false));
    const ownerHeading = await screen.findByRole('heading', { name: 'People helping you' });
    await waitFor(() => expect(ownerHeading).toHaveFocus());
    expect(await screen.findByText("You've stopped helping Anna.")).toHaveAttribute('role', 'status');
    expect(screen.queryByText("You're helping Anna.")).not.toBeInTheDocument();

    await openYourPeople(user);
    expect(screen.queryByText('Margaret Hayes')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: CREATE })).toBeInTheDocument();
    expect(mocks.leaveMembership).toHaveBeenCalledTimes(1);
  });

  it('offline: nothing changes and the line says a connection is needed', async () => {
    mocks.leaveMembership.mockResolvedValue({ ok: false, reason: 'offline' });
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await openAccount(user));
    const pullsBefore = mocks.listFlows.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: 'Stop helping' }));

    const line = await screen.findByText('You need a connection to stop helping. Nothing has changed.');
    expect(line).toHaveAttribute('role', 'status');
    expect(screen.queryByText('You need a connection to do this. Nothing else is affected.')).not.toBeInTheDocument();
    // The confirm step stays open: nothing has changed.
    expect(screen.getByRole('button', { name: 'Keep helping' })).toBeInTheDocument();
    expect(mocks.leaveMembership).toHaveBeenCalledTimes(1);
    expect(mocks.listFlows.mock.calls.length).toBe(pullsBefore);
    expect(screen.getByText("You're helping Anna.")).toBeInTheDocument();
    expect(stored().some((s) => s.flowId === FLOW && s.role === 'member')).toBe(true);

    await openYourPeople(user);
    expect(screen.getByText('Margaret Hayes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: CREATE })).not.toBeInTheDocument();
  });

  it('takes the shared people off the device even when the pull after the leave fails', async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    const button = await openAccount(user);
    mocks.listFlows.mockImplementation(async () => {
      if (mocks.left) {
        throw new TypeError('Failed to fetch');
      }
      return { ok: true, flows: [SHARED], dropped: 0 };
    });
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Stop helping' }));

    await waitFor(() => expect(mocks.leaveMembership).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(stored().some((s) => s.role === 'member')).toBe(false));
    await openYourPeople(user);
    expect(screen.queryByText('Margaret Hayes')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: CREATE })).toBeInTheDocument();
  });

  it('takes the shared people off the device while a pull is still out, and its older answer never brings them back', async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    const button = await openAccount(user);
    // The next pull hangs, started before the leave, and later answers with the list from before it.
    let answer: (value: unknown) => void = () => undefined;
    const calls = mocks.listFlows.mock.calls.length;
    mocks.listFlows.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(mocks.listFlows.mock.calls.length).toBe(calls + 1));

    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Stop helping' }));
    await waitFor(() => expect(mocks.leaveMembership).toHaveBeenCalledTimes(1));
    // Still out, and the shared person is already gone.
    await waitFor(() => expect(stored().some((s) => s.role === 'member')).toBe(false));
    expect(mocks.listFlows.mock.calls.length).toBe(calls + 1);

    // Every pull after this one fails, so nothing fresh can tidy up after an applied old answer.
    mocks.listFlows.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    answer({ ok: true, flows: [SHARED], dropped: 0 });
    // The wake from the leave asks for one more pull.
    await waitFor(() => expect(mocks.listFlows.mock.calls.length).toBe(calls + 2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stored().some((s) => s.role === 'member')).toBe(false);
    await openYourPeople(user);
    expect(screen.queryByText('Margaret Hayes')).not.toBeInTheDocument();
  });

  it('already not a member (left elsewhere): treated as left, the step closes and the people leave', async () => {
    mocks.leaveMembership.mockImplementation(async () => {
      mocks.left = true;
      return { ok: false, reason: 'not_a_member' };
    });
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await openAccount(user));
    await user.click(screen.getByRole('button', { name: 'Stop helping' }));

    expect(await screen.findByText("You've stopped helping Anna.")).toBeInTheDocument();
    expect(screen.queryByText("You aren't helping on anyone's account right now.")).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep helping' })).not.toBeInTheDocument();
    await waitFor(() => expect(stored().some((s) => s.role === 'member')).toBe(false));
    await openYourPeople(user);
    expect(await screen.findByRole('button', { name: CREATE })).toBeInTheDocument();
  });

  it('unavailable: the step stays open with the calm copy and nothing changes', async () => {
    mocks.leaveMembership.mockResolvedValue({ ok: false, reason: 'unavailable' });
    const user = userEvent.setup();
    renderApp(<App />);
    await user.click(await openAccount(user));
    await user.click(screen.getByRole('button', { name: 'Stop helping' }));

    expect(await screen.findByText("This isn't available right now. Please try again in a moment.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep helping' })).toBeInTheDocument();
    expect(stored().some((s) => s.flowId === FLOW && s.role === 'member')).toBe(true);
  });
});
