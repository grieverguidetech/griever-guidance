import { contactStore } from '@griever/data-local';
import { deleteAccountThenClear, removeEverythingFromDevice } from './removeFromDevice';

describe('removeEverythingFromDevice', () => {
  it('removes contacts, gg.* keys and a legacy supabase session, leaves other keys, and ends the session', async () => {
    await contactStore.put({ contactId: 'c1' } as never);
    localStorage.setItem('gg.sessions.v1', '[]');
    localStorage.setItem('sb-abc-auth-token', '{}');
    localStorage.setItem('theme', 'dark');
    const endSession = vi.fn().mockResolvedValue(undefined);

    await removeEverythingFromDevice(localStorage, endSession);

    expect(await contactStore.list()).toHaveLength(0);
    expect(localStorage.getItem('gg.sessions.v1')).toBeNull();
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull();
    expect(localStorage.getItem('gg.signOutPending')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(endSession).toHaveBeenCalledOnce();
  });

  it('still removes everything, and marks the sign-out pending, when ending the session fails', async () => {
    localStorage.setItem('gg.profile.v1', '{}');
    localStorage.setItem('gg.signedIn.v1', 'u1');
    await removeEverythingFromDevice(localStorage, () => Promise.reject(new Error('x')));
    expect(localStorage.getItem('gg.profile.v1')).toBeNull();
    expect(localStorage.getItem('gg.signedIn.v1')).toBeNull();
    expect(localStorage.getItem('gg.signOutPending')).toBe('1');
  });

  it('does not mark a sign-out pending when there is no session to end', async () => {
    await removeEverythingFromDevice(localStorage);
    expect(localStorage.getItem('gg.signOutPending')).toBeNull();
  });
});

describe('deleteAccountThenClear', () => {
  it('clears this device only after Clerk resolves', async () => {
    localStorage.setItem('gg.sessions.v1', '[]');
    let sawKeyWhenDeleting: string | null = null;
    const deleteAccount = vi.fn(async () => {
      sawKeyWhenDeleting = localStorage.getItem('gg.sessions.v1');
    });
    expect(await deleteAccountThenClear(deleteAccount, localStorage)).toBe(true);
    expect(sawKeyWhenDeleting).toBe('[]');
    expect(localStorage.getItem('gg.sessions.v1')).toBeNull();
    expect(localStorage.getItem('gg.signOutPending')).toBeNull();
  });

  it('rejects and keeps every local store when Clerk fails', async () => {
    await contactStore.put({ contactId: 'c2' } as never);
    localStorage.setItem('gg.sessions.v1', '[]');
    await expect(deleteAccountThenClear(() => Promise.reject(new Error('offline')), localStorage)).rejects.toThrow('offline');
    expect(localStorage.getItem('gg.sessions.v1')).toBe('[]');
    expect(await contactStore.list()).toHaveLength(1);
    await contactStore.clearAll();
  });

  it('resolves false, not a rejection, when the account is deleted but the local clear fails', async () => {
    const broken = {
      length: 1,
      key: () => {
        throw new Error('storage blocked');
      },
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    const deleteAccount = vi.fn().mockResolvedValue(undefined);
    expect(await deleteAccountThenClear(deleteAccount, broken)).toBe(false);
    expect(deleteAccount).toHaveBeenCalledOnce();
  });
});
