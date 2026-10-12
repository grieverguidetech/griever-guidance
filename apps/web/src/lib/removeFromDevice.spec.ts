import { contactStore } from '@griever/data-local';
import { removeEverythingFromDevice } from './removeFromDevice';

describe('removeEverythingFromDevice', () => {
  it('removes contacts, gg.* keys and supabase session keys, and ends the local session', async () => {
    await contactStore.put({ contactId: 'c1' } as never);
    localStorage.setItem('gg.sessions.v1', '[]');
    localStorage.setItem('sb-abc-auth-token', '{}');
    localStorage.setItem('theme', 'dark');
    const endSession = vi.fn().mockResolvedValue(undefined);

    await removeEverythingFromDevice(localStorage, endSession);

    expect(await contactStore.list()).toHaveLength(0);
    expect(localStorage.getItem('gg.sessions.v1')).toBeNull();
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(endSession).toHaveBeenCalledOnce();
  });

  it('still removes everything when ending the session fails', async () => {
    localStorage.setItem('gg.profile.v1', '{}');
    await removeEverythingFromDevice(localStorage, () => Promise.reject(new Error('x')));
    expect(localStorage.getItem('gg.profile.v1')).toBeNull();
  });
});
