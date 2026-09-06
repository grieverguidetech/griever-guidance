import { useCallback, useEffect, useState } from 'react';
import type { Contact, ContactRecordSource, ContactTier } from '@griever/shared';

export interface NewManualContact {
  name: string;
  /** Already normalized to E.164 — the screen owns validation before calling this. */
  phone: string;
  tier: ContactTier;
}

export interface PickedContact {
  name: string;
  /** Already normalized to E.164 (see `@griever/contacts`'s `normalizeFetchedContact`). */
  phone: string;
  email: string | null;
  tier: ContactTier;
}

/**
 * The persisted half of the contacts architecture (tasks/03-contacts.md §3) —
 * a thin async interface so this hook stays platform-agnostic (CLAUDE.md rule 4)
 * while the real backing store (`@griever/data-local`'s `contactStore`, IndexedDB)
 * lives only in `apps/web`. Undefined `store` keeps contacts in memory only, for
 * callers (mobile's mock screens) that haven't wired persistence yet.
 */
export interface ContactStore {
  list(): Promise<Contact[]>;
  put(contact: Contact): Promise<void>;
  putMany(contacts: Contact[]): Promise<void>;
  delete(contactId: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface UseContactsResult {
  /** The full roster. Empty until an account has added or imported people. */
  contacts: Contact[];
  /** True until the initial load from `store` resolves. */
  loading: boolean;
  addContact: (input: NewManualContact) => Promise<Contact>;
  /** D4's "confirm, then commit" — one call, one write, per contact picked. */
  importContacts: (picked: PickedContact[], source: ContactRecordSource) => Promise<Contact[]>;
  setTier: (contactId: string, tier: ContactTier) => void;
  removeContact: (contactId: string) => void;
  /** Retention expiry (30 days past the latest known service date) — see `useSessions`. */
  clearAll: () => Promise<void>;
}

function newContactId(): string {
  return `ct_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function useContacts(store?: ContactStore): UseContactsResult {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!store) {
      setLoading(false);
      return;
    }
    store.list().then((loaded) => {
      if (!cancelled) {
        setContacts(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const addContact = useCallback(
    async ({ name, phone, tier }: NewManualContact) => {
      const contact: Contact = {
        contactId: newContactId(),
        name,
        phone,
        email: null,
        tier,
        source: 'manual',
        createdAt: Date.now(),
      };
      setContacts((list) => [...list, contact]);
      await store?.put(contact);
      return contact;
    },
    [store],
  );

  const importContacts = useCallback(
    async (picked: PickedContact[], source: ContactRecordSource) => {
      const created: Contact[] = picked.map((p) => ({
        contactId: newContactId(),
        name: p.name,
        phone: p.phone,
        email: p.email,
        tier: p.tier,
        source,
        createdAt: Date.now(),
      }));
      setContacts((list) => [...list, ...created]);
      await store?.putMany(created);
      return created;
    },
    [store],
  );

  const setTier = useCallback(
    (contactId: string, tier: ContactTier) => {
      setContacts((list) => {
        const next = list.map((c) => (c.contactId === contactId ? { ...c, tier } : c));
        const updated = next.find((c) => c.contactId === contactId);
        if (updated) void store?.put(updated);
        return next;
      });
    },
    [store],
  );

  const removeContact = useCallback(
    (contactId: string) => {
      setContacts((list) => list.filter((c) => c.contactId !== contactId));
      void store?.delete(contactId);
    },
    [store],
  );

  const clearAll = useCallback(async () => {
    setContacts([]);
    await store?.clearAll();
  }, [store]);

  return { contacts, loading, addContact, importContacts, setTier, removeContact, clearAll };
}
