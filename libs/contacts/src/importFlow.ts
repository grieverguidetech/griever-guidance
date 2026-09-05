import type { ContactSource } from "./source.js";
import {
  normalizeFetchedContact,
  dedupeByPhone,
  rankContacts,
  partitionAlreadyStored,
  detectDeviceRegion,
  type NormalizedContact,
} from "./normalize.js";

export interface ImportCandidates {
  fresh: NormalizedContact[];
  alreadyStored: NormalizedContact[];
}

/**
 * The one-shot fetch → normalize → dedupe → rank pipeline (§4/§5/§6).
 * Deliberately does NOT write anything to storage — "confirm, then commit"
 * (§4) stays one explicit, separate step the caller controls (see
 * `@griever/data-local`'s `contactStore.putMany`), so the drop of the
 * working list can't be forgotten on a new exit path.
 */
export async function runImport(
  source: ContactSource,
  storedPhones: ReadonlySet<string>,
  defaultRegion = detectDeviceRegion(),
): Promise<ImportCandidates> {
  const fetched = await source.fetch();
  const normalized = fetched
    .map((contact) => normalizeFetchedContact(contact, defaultRegion))
    .filter((contact): contact is NormalizedContact => contact !== null);
  const deduped = dedupeByPhone(normalized);
  const ranked = rankContacts(deduped);
  return partitionAlreadyStored(ranked, storedPhones);
}
