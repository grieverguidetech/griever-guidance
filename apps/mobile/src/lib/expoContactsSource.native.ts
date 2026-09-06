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
    try {
      const response = await getPermissionsAsync();
      return response.granted || response.canAskAgain;
    } catch (err) {
      // The native module (`ExpoContactsNext`, only in expo-contacts 56.0.6+)
      // isn't present — most likely an Expo Go build older than this
      // dependency. Log the real error so it shows up in the Metro terminal;
      // the caller treats "unavailable" the same as "not on this device."
      console.error('[expoContactsSource] isAvailable() failed:', err);
      return false;
    }
  },

  async fetch() {
    let response;
    try {
      response = await requestPermissionsAsync();
    } catch (err) {
      console.error('[expoContactsSource] requestPermissionsAsync() failed:', err);
      throw err;
    }
    if (!response.granted) {
      // A denial is "nothing chosen," same as backing out of a picker —
      // not a scary error to surface (source.ts's Cancelled contract).
      throw new Cancelled();
    }

    try {
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
    } catch (err) {
      console.error('[expoContactsSource] Contact.getAllDetails() failed:', err);
      throw err;
    }
  },

  preselected: false,
};
