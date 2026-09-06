import { Cancelled } from '@griever/contacts';
import type { ContactSource } from '@griever/contacts';

/**
 * expo-contacts has no web implementation — importing its native module at
 * all crashes on web (it reads enum constants off a native module that
 * doesn't exist there), so Metro's `.web.ts`/`.native.ts` platform-file
 * convention keeps this file's real counterpart (`expoContactsSource.native.ts`)
 * out of the web bundle entirely, rather than guessing at a runtime guard
 * inside a file that still imports the crashing module at the top.
 * `apps/mobile`'s web target is a dev-preview convenience (nothing in this
 * repo ships it), not a place device contacts need to work.
 */
export const expoContactsSource: ContactSource = {
  id: 'native',
  preselected: false,
  async isAvailable() {
    return false;
  },
  async fetch() {
    throw new Cancelled();
  },
};
