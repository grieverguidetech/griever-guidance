import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
import { Cancelled } from '@griever/contacts';
import type { ContactSource, FetchedContact } from '@griever/contacts';

/**
 * The `native` adapter reserved for mobile in `@griever/contacts`'s registry
 * comment — device APIs live in `apps/mobile`, not the shared lib (CLAUDE.md
 * rule 4). `preselected: false`: unlike the web Contact Picker, expo-contacts
 * hands back the whole address book, not a user-made selection, so the
 * in-app review/select step (the same one every non-preselected source uses)
 * is still required.
 *
 * Uses expo-contacts' current class-based API (`Contact.getAllDetails`), not
 * the deprecated `getContactsAsync`/`Fields` module-level API from older
 * SDKs — verified against the installed expo-contacts version's own type
 * definitions rather than assumed from prior knowledge, since the API was
 * substantially redesigned.
 */
export const expoContactsSource: ContactSource = {
  id: 'native',

  async isAvailable() {
    const response = await getPermissionsAsync();
    return response.granted || response.canAskAgain;
  },

  async fetch() {
    const response = await requestPermissionsAsync();
    if (!response.granted) {
      // A denial is "nothing chosen," same as backing out of a picker —
      // not a scary error to surface (source.ts's Cancelled contract).
      throw new Cancelled();
    }

    const details = await Contact.getAllDetails([
      ContactField.FULL_NAME,
      ContactField.PHONES,
      ContactField.EMAILS,
    ]);

    return details.map((c, i): FetchedContact => ({
      key: c.id || `native_${i}`,
      displayName: c.fullName?.trim() || 'Unnamed',
      phones: (c.phones ?? []).map((p) => p.number ?? '').filter(Boolean),
      emails: (c.emails ?? []).map((e) => e.address ?? '').filter(Boolean),
    }));
  },

  preselected: false,
};
