import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Every key this app keeps on the phone starts with `gg.`: people (sessions, with their sent records
 * and `obituaryEmailedAt`), the open person, contacts, the checklist, drafts, the account cache and
 * signed-in marker, queued syncs, and each person's publisher email. Web removes the same set.
 */
export const OUR_KEY_PREFIX = 'gg.';

/** Lists our keys. Throws when the list cannot be read. */
async function ourKeys(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(OUR_KEY_PREFIX));
}

/** Removes the given keys; true when every removal worked. */
async function removeAll(keys: readonly string[]): Promise<boolean> {
  const results = await Promise.allSettled(keys.map((key) => AsyncStorage.removeItem(key)));
  return results.every((result) => result.status === 'fulfilled');
}

/**
 * Removes everything this app keeps on this phone. Local only: no request is made.
 * Resolves true when every key was removed, false when some could not be (or the list could not be read).
 * Never throws: the account is already deleted when this runs.
 *
 * Writers in the app are fire-and-forget (a save started just before the delete can land after it), so
 * after the first pass this waits a tick and removes any `gg.` key that has appeared since.
 */
export async function deleteLocalData(): Promise<boolean> {
  try {
    const removedFirst = await removeAll(await ourKeys());
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const late = await ourKeys();
    const removedLate = await removeAll(late);
    return removedFirst && removedLate && (await ourKeys()).length === 0;
  } catch {
    return false;
  }
}

const deletedListeners = new Set<() => void>();

/** The running app and the account provider listen, so they can drop what they hold in memory after a delete. Returns the unsubscribe. */
export function onAccountDeleted(listener: () => void): () => void {
  deletedListeners.add(listener);
  return () => {
    deletedListeners.delete(listener);
  };
}

/**
 * Tells the running app that the account is deleted. The app drops the send flow first and only then sweeps this phone
 * with `deleteLocalData`, so nothing in the send flow can write after the sweep.
 */
export function announceAccountDeleted(): void {
  deletedListeners.forEach((listener) => listener());
}
