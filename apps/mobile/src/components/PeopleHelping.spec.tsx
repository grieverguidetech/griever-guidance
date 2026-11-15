import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { GetMembersResult } from '@griever/api-client';
import type { MembersView } from '@griever/shared';
import { PeopleHelping } from './PeopleHelping';

const mockGetMembers = jest.fn<(token: string) => Promise<GetMembersResult>>();
jest.mock('@griever/api-client', () => ({
  ...jest.requireActual<object>('@griever/api-client'),
  getMembers: (token: string) => mockGetMembers(token),
}));

const mockFlags = { sharing: true };
jest.mock('../lib/features', () => ({
  get SHARING_ENABLED() {
    return mockFlags.sharing;
  },
}));

let mockAuth: { status: string; userId: string | null; getToken: () => Promise<string | null> } | null;
jest.mock('../lib/AccountProvider', () => ({ useSyncAuth: () => mockAuth }));

const ownerView: MembersView = {
  role: 'owner',
  members: [
    { id: 'm1', name: 'Sam Lee', email: 'sam@example.com' },
    { id: 'm2', name: null, email: 'pat@example.com' },
  ],
  invites: [{ id: 'i1', email: 'kim@example.com', expiresAt: '2026-12-05T12:00:00.000Z', createdAt: '2026-11-28T12:00:00.000Z' }],
};

const headings = () => screen.getAllByRole('heading').map((node) => node.props.children);

beforeEach(() => {
  mockGetMembers.mockReset();
  mockFlags.sharing = true;
  mockAuth = { status: 'signed_in', userId: 'u1', getToken: async () => 'tok' };
});

describe('PeopleHelping', () => {
  it('shows the owner their helpers and pending invitations', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: ownerView });
    render(<PeopleHelping sessionEnded={false} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByText('Sam Lee')).toBeTruthy();
    expect(screen.getByText('pat@example.com')).toBeTruthy();
    expect(screen.getByText('kim@example.com')).toBeTruthy();
    expect(screen.getByText('Invited · link works until December 5, 2026')).toBeTruthy();
    expect(headings()).toEqual(['People helping you', 'Helping you', 'Invited']);
    expect(screen.getByText(/They can see the people you're writing about/)).toBeTruthy();
    expect(mockGetMembers).toHaveBeenCalledWith('tok');
    expect(screen.queryByText('Loading…')).toBeNull();
  });

  it('shows only the heading and intro for an owner with no one yet', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'owner', members: [], invites: [] } });
    render(<PeopleHelping sessionEnded={false} />);
    await waitFor(() => expect(mockGetMembers).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(headings()).toEqual(['People helping you']);
  });

  it('shows a member only the line about who they help', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: 'Anna' } } });
    render(<PeopleHelping sessionEnded={false} />);
    expect(await screen.findByText("You're helping Anna.")).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText('Invited')).toBeNull();
  });

  it('says someone when the owner has no name', async () => {
    mockGetMembers.mockResolvedValue({ ok: true, view: { role: 'member', owner: { id: 'o1', name: null } } });
    render(<PeopleHelping sessionEnded={false} />);
    expect(await screen.findByText("You're helping someone.")).toBeTruthy();
  });

  it('shows the hook message when the first load fails', async () => {
    mockGetMembers.mockResolvedValue({ ok: false, reason: 'offline' });
    render(<PeopleHelping sessionEnded={false} />);
    expect(await screen.findByText('You need a connection to do this. Nothing else is affected.')).toBeTruthy();
  });

  it('renders nothing and never asks when sharing is off', () => {
    mockFlags.sharing = false;
    const { toJSON } = render(<PeopleHelping sessionEnded={false} />);
    expect(toJSON()).toBeNull();
    expect(mockGetMembers).not.toHaveBeenCalled();
  });

  it.each(['signed_out', 'loading'])('renders nothing and never asks when the status is %s', (status) => {
    mockAuth = { status, userId: null, getToken: async () => null };
    const { toJSON } = render(<PeopleHelping sessionEnded={false} />);
    expect(toJSON()).toBeNull();
    expect(mockGetMembers).not.toHaveBeenCalled();
  });

  it('renders nothing and never asks when accounts are unavailable', () => {
    mockAuth = null;
    const { toJSON } = render(<PeopleHelping sessionEnded={false} />);
    expect(toJSON()).toBeNull();
    expect(mockGetMembers).not.toHaveBeenCalled();
  });

  it('renders nothing and never asks when the session has ended', () => {
    const { toJSON } = render(<PeopleHelping sessionEnded />);
    expect(toJSON()).toBeNull();
    expect(mockGetMembers).not.toHaveBeenCalled();
  });
});
