import { clearAllLocalData } from '@griever/data-local';

/** What the browser storage needs to give back: just enough to list and drop keys. */
export type KeyStorage = Pick<Storage, 'length' | 'key' | 'removeItem' | 'setItem'>;

/**
 * Set when ending the Clerk session failed (for example offline). The next online load finishes
 * the sign-out; until then the person is treated as signed out on this device.
 */
export const SIGN_OUT_PENDING_KEY = 'gg.signOutPending';

/** Never throws: storage trouble must not stop a sign-out. */
export function markSignOutPending(storage: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  try {
    storage.setItem(SIGN_OUT_PENDING_KEY, '1');
  } catch {
    /* storage blocked; the sign-out is retried only if the session is still there */
  }
}

/**
 * Every localStorage key this app owns: `gg.*` (sessions, drafts, profile cache, pointers, markers)
 * and a Supabase session left on the device by an earlier version.
 */
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
 * sends, account, sync identity), our localStorage keys, and the signed-in marker. Local only: no
 * request is made and nothing on a server or another phone is touched.
 */
export async function removeEverythingFromDevice(
  storage: KeyStorage,
  endLocalSession?: () => Promise<unknown>,
): Promise<void> {
  await clearAllLocalData();
  removeOurKeys(storage);
  let sessionEnded = true;
  try {
    await endLocalSession?.();
  } catch {
    sessionEnded = false;
  }
  removeOurKeys(storage);
  // The purge above is done either way; a session Clerk could not end (offline) is finished on the next online load.
  if (!sessionEnded) {
    markSignOutPending(storage);
  }
}
