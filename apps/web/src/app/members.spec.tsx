/**
 * Family sharing wired into the real App (#127), with a stub auth client and a stubbed members
 * api-client. No network. Flags are mocked so each test picks its own setup.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthClient } from '@griever/api-client/auth';
import type { MembersView } from '@griever/shared';
import type { AuthClientResult } from '../lib/authClient';

const mocks = vi.hoisted(() => ({
  sharing: true,
  load: vi.fn<() => Promise<AuthClientResult>>(),
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
  return { ...actual, loadAuthClient: mocks.load };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return {
    ...actual,
    getMembers: mocks.getMembers,
    createInvite: mocks.createInvite,
    revokeInvite: mocks.revokeInvite,
    removeMember: mocks.removeMember,
    acceptInvite: mocks.acceptInvite,
  };
});

import { App } from './app';

function client(accountType: 'owner' | 'member'): AuthClient {
  const profile = {
    id: 'u1',
    senderName: 'Anna',
    contactSource: null,
    accountType,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
  };
  return {
    getSession: vi.fn(async () => ({
      status: 'signed_in' as const,
      session: { userId: 'u1', email: 'a@b.co', accessToken: 'tok' },
    })),
    getProfile: vi.fn(async () => ({ ok: true as const, profile })),
    refreshSession: vi.fn(async () => ({ status: 'signed_out' as const })),
    signOut: vi.fn(async () => ({ ok: true as const, serverRevoked: true })),
  } as unknown as AuthClient;
}

const OWNER_VIEW: MembersView = {
  role: 'owner',
  members: [{ id: 'm1', name: 'Ben', email: 'ben@example.com' }],
  invites: [],
};
const MEMBER_VIEW: MembersView = { role: 'member', owner: { id: 'o1', name: 'Anna' } };

function signedInAs(accountType: 'owner' | 'member') {
  mocks.load.mockResolvedValue({ available: true, client: client(accountType) });
}

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Your account' }));
}

beforeEach(() => {
  mocks.sharing = true;
  window.localStorage.clear();
  for (const m of [mocks.load, mocks.getMembers, mocks.createInvite, mocks.revokeInvite, mocks.removeMember]) {
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

describe('profile not known to be a member', () => {
  it('keeps "Create a new one" when the profile cannot be read', async () => {
    const c = client('owner');
    c.getProfile = vi.fn(async () => ({ ok: false as const, reason: 'network' as const })) as never;
    mocks.load.mockResolvedValue({ available: true, client: c });
    render(<App />);
    expect(await screen.findByRole('button', { name: "Start with someone I've lost" })).toBeInTheDocument();
  });
});

describe('sharing flag off', () => {
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
