/**
 * Family sharing wired into the real App (#127), with a fake Clerk and a stubbed profile and members
 * api-client. No network. Flags are mocked so each test picks its own setup.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MembersView } from '@griever/shared';
import type { ClerkLoadResult } from '../lib/authClient';
import { fakeClerk } from '../test-clerk';

const mocks = vi.hoisted(() => ({
  sharing: true,
  loadClerk: vi.fn<() => Promise<ClerkLoadResult>>(),
  getProfile: vi.fn(),
  getMembers: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
  removeMember: vi.fn(),
  acceptInvite: vi.fn(),
}));

vi.mock('../lib/features', () => ({
  AUTH_ENABLED: true,
  OBITUARY_DRAFTING_ENABLED: false,
  get SHARING_ENABLED() {
    return mocks.sharing;
  },
}));
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
    createInvite: mocks.createInvite,
    revokeInvite: mocks.revokeInvite,
    removeMember: mocks.removeMember,
    acceptInvite: mocks.acceptInvite,
  };
});

import { App } from './app';

function profileFor(accountType: 'owner' | 'member') {
  return {
    id: 'u1',
    senderName: 'Anna',
    contactSource: null,
    fullName: null,
    birthDate: null,
    accountType,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
}

const OWNER_VIEW: MembersView = {
  role: 'owner',
  members: [{ id: 'm1', name: 'Ben', email: 'ben@example.com' }],
  invites: [],
};
const MEMBER_VIEW: MembersView = { role: 'member', owner: { id: 'o1', name: 'Anna' } };

function signedInAs(accountType: 'owner' | 'member', options: Parameters<typeof fakeClerk>[0] = {}) {
  mocks.getProfile.mockResolvedValue({ ok: true, profile: profileFor(accountType) });
  mocks.loadClerk.mockResolvedValue(fakeClerk({ userId: 'u1', ...options }).load);
}

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Your account' }));
}

beforeEach(() => {
  mocks.sharing = true;
  window.localStorage.clear();
  for (const m of [mocks.loadClerk, mocks.getProfile, mocks.getMembers, mocks.createInvite, mocks.revokeInvite, mocks.removeMember]) {
    m.mockReset();
  }
  mocks.getMembers.mockResolvedValue({ ok: true, view: OWNER_VIEW });
  mocks.createInvite.mockResolvedValue({ ok: true });
});

describe('owner, flags on', () => {
  it('shows People helping you on Profile and sends one invitation with the typed email', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    render(<App />);
    await openProfile(user);
    await screen.findByRole('heading', { name: 'People helping you' });
    await user.type(screen.getByLabelText('Their email'), 'Sam@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send an invitation' }));
    await waitFor(() => expect(mocks.createInvite).toHaveBeenCalledTimes(1));
    expect(mocks.createInvite).toHaveBeenCalledWith('tok', 'sam@example.com');
  });

  it('shows the remove section in Settings', async () => {
    signedInAs('owner');
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('button', { name: 'Remove Ben' })).toBeInTheDocument();
  });

  it('shows Home before the members request resolves (C5)', async () => {
    signedInAs('owner');
    mocks.getMembers.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    await openProfile(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'People helping you' })).not.toBeInTheDocument();
  });

  it('shows no remove section in Settings while the list is still loading', async () => {
    signedInAs('owner');
    mocks.getMembers.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Ben' })).not.toBeInTheDocument();
  });
});

describe('member, flags on', () => {
  beforeEach(() => {
    mocks.getMembers.mockResolvedValue({ ok: true, view: MEMBER_VIEW });
    signedInAs('member');
  });

  it('has no "Create a new one" on Home', async () => {
    render(<App />);
    // The member note only shows once the profile says member; the button is gone with it.
    expect(await screen.findByText(/the people you're helping will show here/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Start with someone I've lost" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Someone else I've lost" })).not.toBeInTheDocument();
  });

  it("says who they are helping on Profile and offers no invite form or remove section", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openProfile(user);
    expect(await screen.findByText("You're helping Anna.")).toBeInTheDocument();
    expect(screen.queryByLabelText('Their email')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.queryByRole('button', { name: 'Remove Ben' })).not.toBeInTheDocument();
  });
});

describe('token cannot be had', () => {
  it('shows Profile and makes no members call (the token is the adapter\'s, and it is offline)', async () => {
    signedInAs('owner', { getToken: async () => ({ ok: false as const, reason: 'offline' as const }) });
    const user = userEvent.setup();
    render(<App />);
    await openProfile(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(mocks.getMembers).not.toHaveBeenCalled();
  });
});

describe('profile not known to be a member', () => {
  it('keeps "Create a new one" when the profile cannot be read', async () => {
    signedInAs('owner');
    mocks.getProfile.mockResolvedValue({ ok: false, reason: 'failed' });
    render(<App />);
    expect(await screen.findByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
  });
});

describe('sharing flag off', () => {
  it('keeps the create button for a member profile', async () => {
    mocks.sharing = false;
    signedInAs('member');
    render(<App />);
    expect(await screen.findByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Your account' });
    expect(screen.queryByText(/the people you're helping will show here/)).not.toBeInTheDocument();
  });

  it('makes no members or invites call and shows no new UI', async () => {
    mocks.sharing = false;
    signedInAs('owner');
    const user = userEvent.setup();
    render(<App />);
    await openProfile(user);
    await screen.findByRole('heading', { level: 1, name: 'Your account' });
    expect(screen.queryByRole('heading', { name: 'People helping you' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(screen.queryByRole('button', { name: 'Remove Ben' })).not.toBeInTheDocument();
    for (const m of [mocks.getMembers, mocks.createInvite, mocks.revokeInvite, mocks.removeMember]) {
      expect(m).not.toHaveBeenCalled();
    }
  });
});
