import { renderHook, waitFor } from '@testing-library/react';
import { useContacts } from './useContacts.js';
import type { ContactStore } from './useContacts.js';

function storeWith(list: ContactStore['list']): ContactStore {
  return { list, put: vi.fn(), putMany: vi.fn(), delete: vi.fn(), clearAll: vi.fn() } as ContactStore;
}

describe('useContacts loading', () => {
  it('stops loading with no contacts when the local read fails', async () => {
    const { result } = renderHook(() => useContacts(storeWith(() => Promise.reject(new Error('blocked')))));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contacts).toEqual([]);
  });

  it('loads what the store holds', async () => {
    const contact = { contactId: 'c1', name: 'A', phone: '+16175550148', tier: 'family' };
    const { result } = renderHook(() => useContacts(storeWith(async () => [contact] as never)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.contacts).toHaveLength(1);
  });
});
