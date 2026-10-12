import { act, renderHook, waitFor } from '@testing-library/react';
import type { MembersFailureReason } from '@griever/api-client';
import type { MembersView } from '@griever/shared';
import { MEMBERS_MESSAGES, useMembers } from './useMembers.js';
import type { MembersClient } from './useMembers.js';

const ownerView: MembersView = {
  role: 'owner',
  members: [{ id: 'm1', name: 'Sam', email: 'sam@example.com' }],
  invites: [],
};

function stub(over: Partial<MembersClient> = {}) {
  const client = {
    getMembers: vi.fn<MembersClient['getMembers']>(async () => ({ ok: true as const, view: ownerView })),
    createInvite: vi.fn(async () => ({
      ok: true as const,
      invite: { id: 'i1', email: 'a@b.co', createdAt: 'x', expiresAt: 'y' },
    })),
    revokeInvite: vi.fn(async () => ({ ok: true as const })),
    removeMember: vi.fn(async () => ({ ok: true as const })),
    acceptInvite: vi.fn(async () => ({ ok: true as const, ownerId: 'o1' })),
    ...over,
  };
  return client satisfies MembersClient;
}

const getAccessToken = async () => 'tok';

function setup(client: MembersClient, enabled = true, token: () => Promise<string | null> = getAccessToken) {
  return renderHook(() => useMembers({ getAccessToken: token, enabled, client }));
}

const fail = (reason: MembersFailureReason) => async () => ({ ok: false as const, reason });

describe('useMembers loading', () => {
  it('makes no calls when disabled', async () => {
    const client = stub();
    const { result } = setup(client, false);
    await act(async () => {
      await result.current.refresh();
      await result.current.invite('a@b.co');
      await result.current.revoke('i1');
      await result.current.remove('m1');
      await result.current.accept('t');
    });
    expect(result.current.status).toBe('idle');
    for (const fn of Object.values(client)) expect(fn).not.toHaveBeenCalled();
  });

  it('loads once on mount and refresh reloads', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.view).toEqual(ownerView);
    expect(client.getMembers).toHaveBeenCalledTimes(1);
    expect(client.getMembers).toHaveBeenCalledWith('tok');
    await act(() => result.current.refresh());
    expect(client.getMembers).toHaveBeenCalledTimes(2);
  });

  it('is signed_out without a token and calls nothing', async () => {
    const client = stub();
    const { result } = setup(client, true, async () => null);
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(client.getMembers).not.toHaveBeenCalled();
  });

  it('keeps the last list when a refresh fails offline', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    vi.mocked(client.getMembers).mockImplementationOnce(fail("offline") as never);
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('offline');
    expect(result.current.view).toEqual(ownerView);
    expect(result.current.message).toBe(MEMBERS_MESSAGES.offline);
  });

  it('maps a failed load to unavailable', async () => {
    const client = stub({ getMembers: fail('unavailable') as never });
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.view).toBeNull();
    expect(result.current.message).toBe(MEMBERS_MESSAGES.unavailable);
  });
});

describe('useMembers actions', () => {
  it('invite normalises the email, sends it, then refreshes', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let ok = false;
    await act(async () => {
      ok = await result.current.invite('  Anna@Example.COM ');
    });
    expect(ok).toBe(true);
    expect(client.createInvite).toHaveBeenCalledWith('tok', 'anna@example.com');
    expect(client.getMembers).toHaveBeenCalledTimes(2);
  });

  it('revoke and remove each succeed and refresh', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await result.current.revoke('i1')).toBe(true);
    });
    expect(client.revokeInvite).toHaveBeenCalledWith('tok', 'i1');
    expect(client.getMembers).toHaveBeenCalledTimes(2);
    await act(async () => {
      expect(await result.current.remove('m1')).toBe(true);
    });
    expect(client.removeMember).toHaveBeenCalledWith('tok', 'm1');
    expect(client.getMembers).toHaveBeenCalledTimes(3);
  });

  it('accept succeeds and refreshes', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await result.current.accept('the-token')).toBe(true);
    });
    expect(client.acceptInvite).toHaveBeenCalledWith('tok', 'the-token');
    expect(client.getMembers).toHaveBeenCalledTimes(2);
  });

  it('does not refresh after a failed action', async () => {
    const client = stub({ revokeInvite: fail('failed') as never });
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await result.current.revoke('i1')).toBe(false);
    });
    expect(client.getMembers).toHaveBeenCalledTimes(1);
  });

  it('blocks an invalid email before any request', async () => {
    const client = stub();
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await result.current.invite('not an email')).toBe(false);
    });
    expect(client.createInvite).not.toHaveBeenCalled();
    expect(result.current.message).toBe(MEMBERS_MESSAGES.invalid_email);
  });

  it('offline: says so, never retries or queues', async () => {
    const client = stub({ createInvite: vi.fn(fail('offline')) as never });
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      expect(await result.current.invite('a@b.co')).toBe(false);
    });
    expect(result.current.message).toBe('We need a moment of signal to do this.');
    expect(client.createInvite).toHaveBeenCalledTimes(1);
    expect(client.getMembers).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(client.createInvite).toHaveBeenCalledTimes(1);
  });

  it('a missing token on an action is signed_out and calls nothing', async () => {
    const client = stub();
    let token: string | null = 'tok';
    const { result } = setup(client, true, async () => token);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    token = null;
    await act(async () => {
      expect(await result.current.remove('m1')).toBe(false);
    });
    expect(client.removeMember).not.toHaveBeenCalled();
    expect(result.current.status).toBe('signed_out');
  });
});

describe('useMembers copy per reason', () => {
  const cases: [string, MembersFailureReason, 'invite' | 'accept' | 'revoke', string][] = [
    ['offline', 'offline', 'invite', 'We need a moment of signal to do this.'],
    ['signed_out', 'signed_out', 'invite', 'Please sign in again to do this.'],
    ['invalid', 'invalid', 'invite', "That doesn't look right. Please check it and try again."],
    ['forbidden', 'forbidden', 'invite', "This isn't available for your account."],
    ['rate_limited', 'rate_limited', 'invite', "You've sent a lot of invitations today. You can try again tomorrow."],
    ['conflict on create', 'conflict', 'invite', 'That person is already invited or already helping.'],
    ['conflict on accept', 'conflict', 'accept', MEMBERS_MESSAGES.conflict_accept],
    ['unusable on accept', 'unusable', 'accept', "This invitation can't be used. Ask the person who sent it for a new one."],
    ['unavailable', 'unavailable', 'revoke', "This isn't available right now. Please try again in a moment."],
    ['failed', 'failed', 'revoke', "This isn't available right now. Please try again in a moment."],
  ];

  it.each(cases)('%s', async (_name, reason, action, copy) => {
    const f = fail(reason) as never;
    const client = stub({ createInvite: f, acceptInvite: f, revokeInvite: f });
    const { result } = setup(client);
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      if (action === 'invite') await result.current.invite('a@b.co');
      else if (action === 'accept') await result.current.accept('t');
      else await result.current.revoke('i1');
    });
    expect(result.current.message).toBe(copy);
    expect(copy).not.toContain('!');
  });

  it('no message has an exclamation point', () => {
    for (const text of Object.values(MEMBERS_MESSAGES)) expect(text).not.toContain('!');
  });
});
