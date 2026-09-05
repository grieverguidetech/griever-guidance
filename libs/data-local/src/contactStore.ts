import type { Contact } from "@griever/shared";
import { openDb } from "./db.js";

/**
 * Contacts never leave the device (DATA.md §5) — this store is the entire
 * lifetime of a contact's data. The E.164-match "is this session openable"
 * logic lives in the session-lifecycle module, not here.
 */

export async function list(): Promise<Contact[]> {
  const db = await openDb();
  return db.getAll("contacts");
}

export async function get(contactId: string): Promise<Contact | undefined> {
  const db = await openDb();
  return db.get("contacts", contactId);
}

export async function put(contact: Contact): Promise<void> {
  const db = await openDb();
  await db.put("contacts", contact);
}

/**
 * D4's "confirm, then commit" (tasks/03-contacts.md §4): every selected
 * contact lands in one transaction, so a crash mid-write can't leave a
 * partial import — it's all of them or none.
 */
export async function putMany(contacts: Contact[]): Promise<void> {
  if (contacts.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("contacts", "readwrite");
  await Promise.all(contacts.map((contact) => tx.store.put(contact)));
  await tx.done;
}

export async function remove(contactId: string): Promise<void> {
  const db = await openDb();
  await db.delete("contacts", contactId);
}

/** The stored phone numbers (already E.164), for dedupe against a fresh import (§6/§7). */
export async function listPhones(): Promise<Set<string>> {
  const contacts = await list();
  return new Set(contacts.map((c) => c.phone));
}

export const contactStore = { list, get, put, putMany, delete: remove, listPhones };
