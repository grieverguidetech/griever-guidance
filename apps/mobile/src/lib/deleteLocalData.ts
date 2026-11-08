import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Every key this app keeps on the phone starts with `gg.`: people (sessions, with their sent records
 * and `obituaryEmailedAt`), the open person, contacts, the checklist, drafts, the account cache and
 * signed-in marker, queued syncs, and each person's publisher email. Web removes the same set.
 */
export const OUR_KEY_PREFIX = 'gg.';

/**
 * Removes everything this app keeps on this phone. Local only: no request is made.
 * Resolves true when every key was removed, false when some could not be (or the list could not be read).
 * Never throws: the account is already deleted when this runs.
 */
export async function deleteLocalData(): Promise<boolean> {
  let keys: readonly string[];
  try {
    keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(OUR_KEY_PREFIX));
  } catch {
    return false;
  }
  const results = await Promise.allSettled(keys.map((key) => AsyncStorage.removeItem(key)));
  return results.every((result) => result.status === 'fulfilled');
}
