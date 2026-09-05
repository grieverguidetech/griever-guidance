import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { CountryCode } from "libphonenumber-js";
import type { FetchedContact } from "./source.js";

/** tasks/03-contacts.md §6 — E.164 is the one stored, canonical form. */
export function toE164(raw: string, defaultRegion: CountryCode = "US"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultRegion);
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}

/** Best-effort device region for parsing bare local numbers — a default, never load-bearing. */
export function detectDeviceRegion(): CountryCode {
  try {
    const locale =
      typeof navigator !== "undefined" && navigator.language
        ? navigator.language
        : Intl.DateTimeFormat().resolvedOptions().locale;
    const region = new Intl.Locale(locale).region;
    return (region as CountryCode | undefined) ?? "US";
  } catch {
    return "US";
  }
}

export interface NormalizedContact {
  key: string;
  displayName: string;
  phone: string; // E.164
  email: string | null;
  starred?: boolean;
}

/**
 * One number per contact (§6). `FetchedContact.phones` carries no type
 * metadata (the interface is deliberately narrow — see source.ts), so this
 * takes the first one that normalizes to a valid number rather than
 * guessing which was "mobile"; an adapter that *does* know phone types
 * should put its best guess first in the array before this runs. A contact
 * with no valid number returns null — D4 hides those, it doesn't grey them.
 */
export function normalizeFetchedContact(
  contact: FetchedContact,
  defaultRegion: CountryCode,
): NormalizedContact | null {
  let phone: string | null = null;
  for (const raw of contact.phones) {
    const e164 = toE164(raw, defaultRegion);
    if (e164) {
      phone = e164;
      break;
    }
  }
  if (!phone) return null;
  return {
    key: contact.key,
    displayName: contact.displayName,
    phone,
    email: contact.emails.find((e) => e.trim())?.trim() ?? null,
    starred: contact.starred,
  };
}

/** Dedupe on E.164, never on name (§6) — merge on collision, keep the longer display name. */
export function dedupeByPhone(contacts: NormalizedContact[]): NormalizedContact[] {
  const byPhone = new Map<string, NormalizedContact>();
  for (const contact of contacts) {
    const existing = byPhone.get(contact.phone);
    if (!existing) {
      byPhone.set(contact.phone, contact);
      continue;
    }
    byPhone.set(contact.phone, {
      ...existing,
      displayName:
        contact.displayName.length > existing.displayName.length
          ? contact.displayName
          : existing.displayName,
      email: existing.email ?? contact.email,
      starred: existing.starred || contact.starred,
    });
  }
  return [...byPhone.values()];
}

/**
 * §7 — dedupe a fresh fetch against what's already stored, so a re-entry
 * ("Add more people") doesn't show previously-added people as unselected
 * rows inviting a second copy.
 */
export function partitionAlreadyStored(
  contacts: NormalizedContact[],
  storedPhones: ReadonlySet<string>,
): { fresh: NormalizedContact[]; alreadyStored: NormalizedContact[] } {
  const fresh: NormalizedContact[] = [];
  const alreadyStored: NormalizedContact[] = [];
  for (const contact of contacts) {
    (storedPhones.has(contact.phone) ? alreadyStored : fresh).push(contact);
  }
  return { fresh, alreadyStored };
}

/**
 * §5's ranking — starred first. "Has a mobile-typed number" and
 * "most-recently-modified" (the other two tiers) need data no adapter built
 * so far provides (device-picker and manual don't expose either signal, and
 * the one adapter that could — Google People API — is deferred). Only
 * meaningful for a non-preselected source's in-app list; picker sources
 * skip D4's list — and therefore ranking — entirely (§4).
 */
export function rankContacts(contacts: NormalizedContact[]): NormalizedContact[] {
  return [...contacts].sort((a, b) => Number(b.starred ?? false) - Number(a.starred ?? false));
}
