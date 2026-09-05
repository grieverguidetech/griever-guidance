import { openDb, type LocalContact } from "./db.js";

/**
 * Contacts never leave the device (DATA.md §5) — this store is the entire
 * lifetime of a contact's data. Minimal CRUD; the E.164-match "is this
 * session openable" logic lives in the session-lifecycle module, not here.
 */

export async function list(): Promise<LocalContact[]> {
  const db = await openDb();
  return db.getAll("contacts");
}

export async function get(contactId: string): Promise<LocalContact | undefined> {
  const db = await openDb();
  return db.get("contacts", contactId);
}

export async function put(contact: LocalContact): Promise<void> {
  const db = await openDb();
  await db.put("contacts", contact);
}

export async function remove(contactId: string): Promise<void> {
  const db = await openDb();
  await db.delete("contacts", contactId);
}

export const contactStore = { list, get, put, delete: remove };
