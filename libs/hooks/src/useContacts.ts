import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Contact, ContactTier } from '@griever/shared';
import { MOCK_CONTACTS } from './useMockContacts.js';
import type { SendFlowStorage } from './useSendFlow.js';

export interface NewManualContact {
  name: string;
  phoneNumber: string;
  tier: ContactTier;
}

export interface UseContactsResult {
  /** The full roster. Empty until an account has added or imported people. */
  contacts: Contact[];
  /** The filter every picker needs — "we can only send a text" (D4). */
  contactsWithMobile: Contact[];
  addContact: (input: NewManualContact) => void;
  importContacts: (picked: Contact[]) => void;
  setTier: (id: string, tier: ContactTier) => void;
}

const STORAGE_KEY = 'gg.contacts.v1';

function load(storage: SendFlowStorage | undefined): Contact[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Contact[]) : [];
  } catch {
    return [];
  }
}

function save(storage: SendFlowStorage | undefined, contacts: Contact[]): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    // storage unavailable — contacts still work for this tab's lifetime
  }
}

function newId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useContacts(storage?: SendFlowStorage): UseContactsResult {
  const [contacts, setContacts] = useState<Contact[]>(() => load(storage));

  useEffect(() => {
    save(storage, contacts);
  }, [storage, contacts]);

  const addContact = useCallback(({ name, phoneNumber, tier }: NewManualContact) => {
    setContacts((list) => [
      ...list,
      { id: newId(), name, phoneNumber, selected: false, tier, source: 'manual' },
    ]);
  }, []);

  const importContacts = useCallback((picked: Contact[]) => {
    setContacts((list) => {
      const existingIds = new Set(list.map((c) => c.id));
      const additions = picked
        .filter((c) => !existingIds.has(c.id))
        .map((c) => ({ ...c, source: 'import' as const }));
      return [...list, ...additions];
    });
  }, []);

  const setTier = useCallback((id: string, tier: ContactTier) => {
    setContacts((list) => list.map((c) => (c.id === id ? { ...c, tier } : c)));
  }, []);

  const contactsWithMobile = useMemo(
    () => contacts.filter((c) => c.phoneNumber.trim() !== ''),
    [contacts],
  );

  return { contacts, contactsWithMobile, addContact, importContacts, setTier };
}

/** Seed data for a fresh manual-entry roster (see `useMockContacts`). */
export const CONTACT_SEED = MOCK_CONTACTS;
