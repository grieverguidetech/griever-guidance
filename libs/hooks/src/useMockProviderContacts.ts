import type { Contact } from '@griever/shared';

/**
 * Stand-in for a provider's address book (Google People API and equivalents).
 * The real integration lives behind this hook's signature — swap the body,
 * keep the shape. Ranked by message frequency, not alphabetically, so the
 * import screen's default list is a handful of names, not hundreds.
 * A couple of entries carry no phone number to exercise the "hidden" filter.
 */
const PROVIDER_CONTACTS: Contact[] = [
  { id: 'p-1', name: 'Aunt Carol', phoneNumber: '+16175550201', selected: false, providerLabels: ['Extended family'] },
  { id: 'p-2', name: 'David Reyes', phoneNumber: '+16175550202', selected: false, providerLabels: ['Friends'] },
  { id: 'p-3', name: 'Tom Nguyen', phoneNumber: '+16175550203', selected: false, providerLabels: ['Friends'] },
  { id: 'p-4', name: 'Priya Shah', phoneNumber: '+16175550204', selected: false, providerLabels: ['Work'] },
  { id: 'p-5', name: 'Cousin Beth', phoneNumber: '+16175550205', selected: false, providerLabels: ['Extended family'] },
  { id: 'p-6', name: 'Uncle Ray', phoneNumber: '+16175550206', selected: false, providerLabels: ['Extended family'] },
  { id: 'p-7', name: 'Fr. Michael Doyle', phoneNumber: '+16175550207', selected: false, providerLabels: ['Her church'] },
  { id: 'p-8', name: 'Joan Whitaker', phoneNumber: '+16175550208', selected: false, providerLabels: ['Her church'] },
  { id: 'p-9', name: 'Linda Park', phoneNumber: '+16175550209', selected: false, providerLabels: ['Work'] },
  { id: 'p-10', name: 'Marcus Webb', phoneNumber: '+16175550210', selected: false, providerLabels: ['Friends'] },
  { id: 'p-11', name: 'Grace Odom', phoneNumber: '', selected: false, providerLabels: ['Extended family'] },
  { id: 'p-12', name: 'Old Coworker', phoneNumber: '', selected: false, providerLabels: ['Work'] },
];

/** Frequency-ranked default list — the top of this array, not alphabetical order. */
export function useMockProviderContacts(): Contact[] {
  return PROVIDER_CONTACTS;
}
