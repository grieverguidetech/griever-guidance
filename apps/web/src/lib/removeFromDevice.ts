import { clearAllLocalData } from '@griever/data-local';

/** What the browser storage needs to give back: just enough to list and drop keys. */
export type KeyStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Every localStorage key this app owns: `gg.*` (sessions, drafts, profile cache, pointers) and supabase-js's session. */
function isOurKey(name: string): boolean {
  return name.startsWith('gg.') || /^sb-.+-auth-token(-code-verifier|-user)?$/.test(name);
}

function removeOurKeys(storage: KeyStorage): void {
  const names: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const name = storage.key(i);
    if (name && isOurKey(name)) names.push(name);
  }
  for (const name of names) storage.removeItem(name);
}

/**
 * Removes everything this app keeps on this device: IndexedDB (people, contacts, drafts, outbox,
 * sends, account, sync identity), our localStorage keys, and the stored sign-in. Local only: no
 * request is made and nothing on a server or another phone is touched.
 */
export async function removeEverythingFromDevice(
  storage: KeyStorage,
  endLocalSession?: () => Promise<unknown>,
): Promise<void> {
  await clearAllLocalData();
  removeOurKeys(storage);
  // supabase-js ends a local-scope session without a request; any failure still leaves the keys gone.
  try {
    await endLocalSession?.();
  } catch {
    /* the stored session was already removed above */
  }
  removeOurKeys(storage);
}
