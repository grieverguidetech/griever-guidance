import type { Contact } from '@griever/shared';

export const MOCK_CONTACTS: Contact[] = [
  { id: '1', name: 'Patricia Donnelly', phoneNumber: '+16175550101', selected: false, tier: 'first' },
  { id: '2', name: 'James Callahan', phoneNumber: '+16175550102', selected: false, tier: 'first' },
  { id: '3', name: 'Susan Moriarty', phoneNumber: '+16175550103', selected: false, tier: 'first' },
  { id: '4', name: 'Thomas Reilly', phoneNumber: '+16175550104', selected: false, tier: 'family' },
  { id: '5', name: 'Catherine Brennan', phoneNumber: '+16175550105', selected: false, tier: 'family' },
  { id: '6', name: 'Michael Flynn', phoneNumber: '+16175550106', selected: false, tier: 'family' },
  { id: '7', name: 'Anne Gallagher', phoneNumber: '+16175550107', selected: false, tier: 'family' },
  { id: '8', name: 'Daniel Maguire', phoneNumber: '+16175550108', selected: false, tier: 'family' },
  { id: '9', name: 'Margaret O\'Brien', phoneNumber: '+16175550109', selected: false, tier: 'family' },
  { id: '10', name: 'Kevin Sullivan', phoneNumber: '+16175550110', selected: false, tier: 'family' },
];

/** @deprecated use `useContacts()` — kept only as this pool's original source. */
export function useMockContacts(): Contact[] {
  return MOCK_CONTACTS;
}
