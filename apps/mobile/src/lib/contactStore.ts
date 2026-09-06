import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Contact } from '@griever/shared';
import type { ContactStore } from '@griever/hooks';

/**
 * Mobile's equivalent of `@griever/data-local`'s IndexedDB-backed
 * contactStore — IndexedDB is browser-only, so this is AsyncStorage instead,
 * behind the same `ContactStore` interface `useContacts` already expects
 * (CLAUDE.md rule 4: device/platform storage lives in the app, not a
 * shared lib).
 */
const KEY = 'gg.contacts.v1';

async function readAll(): Promise<Contact[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(contacts: Contact[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(contacts));
}

export const mobileContactStore: ContactStore = {
  async list() {
    return readAll();
  },
  async put(contact) {
    const all = await readAll();
    await writeAll([...all.filter((c) => c.contactId !== contact.contactId), contact]);
  },
  async putMany(contacts) {
    if (contacts.length === 0) return;
    const all = await readAll();
    const ids = new Set(contacts.map((c) => c.contactId));
    await writeAll([...all.filter((c) => !ids.has(c.contactId)), ...contacts]);
  },
  async delete(contactId) {
    await writeAll((await readAll()).filter((c) => c.contactId !== contactId));
  },
  async clearAll() {
    await AsyncStorage.removeItem(KEY);
  },
};

/** Mirrors `@griever/data-local`'s `contactStore.listPhones` (not part of the shared `ContactStore` interface). */
export async function listStoredPhones(): Promise<Set<string>> {
  return new Set((await readAll()).map((c) => c.phone));
}
