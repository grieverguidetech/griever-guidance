import type { ContactSource } from "./source.js";
import { Cancelled } from "./source.js";

/**
 * The Android Chrome Contact Picker API. Not yet in TypeScript's bundled DOM
 * lib, hence the ambient declarations — kept minimal, only what this file
 * actually calls.
 */
interface ContactInfo {
  name?: string[];
  email?: string[];
  tel?: string[];
}
interface ContactsSelectOptions {
  multiple?: boolean;
}
interface ContactsManager {
  select(properties: string[], options?: ContactsSelectOptions): Promise<ContactInfo[]>;
  getProperties?(): Promise<string[]>;
}
declare global {
  interface Navigator {
    contacts?: ContactsManager;
  }
}

let keyCounter = 0;

/**
 * tasks/03-contacts.md §2: "user-driven, no permission prompt, and it
 * returns only what the user selected. This is already the shape §1
 * describes, so nothing needs discarding. Treat it as the model the other
 * adapters imitate." `preselected: true` means D4's own select-and-checkbox
 * screen is skipped entirely — the OS picker already was that screen.
 */
export const devicePickerSource: ContactSource = {
  id: "device-picker",
  preselected: true,

  // Capability-detected, never UA-sniffed (§3, and the task's own "Do not").
  async isAvailable() {
    return (
      typeof navigator !== "undefined" &&
      "contacts" in navigator &&
      typeof navigator.contacts?.select === "function"
    );
  },

  async fetch() {
    if (typeof navigator === "undefined" || !navigator.contacts) {
      throw new Error("Contact Picker API unavailable — call isAvailable() first.");
    }
    let picked: ContactInfo[];
    try {
      picked = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
    } catch (err) {
      // Chrome rejects with an AbortError DOMException specifically when the
      // user dismisses the picker without choosing anyone — that's a cancel,
      // not a failure. Anything else (SecurityError for no user gesture,
      // InvalidStateError for a picker already open, etc.) is a real error.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Cancelled();
      }
      throw err;
    }

    return picked.map((contact) => ({
      key: `dp_${keyCounter++}`,
      displayName: contact.name?.find((n) => n.trim())?.trim() || "Unnamed",
      phones: contact.tel ?? [],
      emails: contact.email ?? [],
    }));
  },
};
