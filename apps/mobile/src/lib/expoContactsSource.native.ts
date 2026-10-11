import { Fields, getContactsAsync, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';
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
 * Uses expo-contacts' module-level API (`getContactsAsync` / `Fields`), which is what the pinned
 * Expo SDK 54 version (15.x) ships. The class-based `Contact.getAllDetails` API only exists in
 * later SDKs; move to it when the SDK is upgraded.
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

    const { data } = await getContactsAsync({ fields: [Fields.Name, Fields.PhoneNumbers, Fields.Emails] });

    return data.map((c, i): FetchedContact => ({
      key: c.id || `native_${i}`,
      displayName: c.name?.trim() || 'Unnamed',
      phones: (c.phoneNumbers ?? []).map((p) => p.number ?? '').filter(Boolean),
      emails: (c.emails ?? []).map((e) => e.email ?? '').filter(Boolean),
    }));
  },

  preselected: false,
};
