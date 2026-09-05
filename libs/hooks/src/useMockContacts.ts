import type { Contact } from '@griever/shared';

/** Mobile has no real import source wired yet (expo-contacts lands in `apps/mobile` — CLAUDE.md rule 4). */
export const MOCK_CONTACTS: Contact[] = [
  { contactId: '1', name: 'Patricia Donnelly', phone: '+16175550101', email: null, tier: 'first', source: 'manual', createdAt: 0 },
  { contactId: '2', name: 'James Callahan', phone: '+16175550102', email: null, tier: 'first', source: 'manual', createdAt: 0 },
  { contactId: '3', name: 'Susan Moriarty', phone: '+16175550103', email: null, tier: 'first', source: 'manual', createdAt: 0 },
  { contactId: '4', name: 'Thomas Reilly', phone: '+16175550104', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '5', name: 'Catherine Brennan', phone: '+16175550105', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '6', name: 'Michael Flynn', phone: '+16175550106', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '7', name: 'Anne Gallagher', phone: '+16175550107', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '8', name: 'Daniel Maguire', phone: '+16175550108', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '9', name: "Margaret O'Brien", phone: '+16175550109', email: null, tier: 'family', source: 'manual', createdAt: 0 },
  { contactId: '10', name: 'Kevin Sullivan', phone: '+16175550110', email: null, tier: 'family', source: 'manual', createdAt: 0 },
];

/** @deprecated use `useContacts()` — kept only as this pool's original source. */
export function useMockContacts(): Contact[] {
  return MOCK_CONTACTS;
}
