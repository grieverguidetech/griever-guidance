import { contactStore } from '@griever/data-local';
import { removeEverythingFromDevice } from './removeFromDevice';

describe('removeEverythingFromDevice', () => {
  it('removes contacts, gg.* keys and an old supabase session, leaves other keys, and ends the session', async () => {
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
