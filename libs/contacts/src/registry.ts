import type { ContactSource } from "./source.js";
import { devicePickerSource } from "./devicePickerSource.js";
import { googleSource } from "./googleSource.js";

/**
 * Every adapter behind one interface, per tasks/02-auth.md's "implement all
 * adapters behind one interface regardless — only D1's rendered list
 * changes." `native` (expo-contacts) isn't here: it's mobile-only and lives
 * in `apps/mobile` (CLAUDE.md rule 4 — device APIs don't belong in a
 * shared, platform-agnostic lib).
 */
export const webContactSources: ContactSource[] = [devicePickerSource, googleSource];

/**
 * tasks/03-contacts.md §2: "D4 does not exist on iOS web; the user goes
 * straight to D3. That is a first-class path, not a degraded one." Checks
 * every registered web source so this stays correct as adapters are added,
 * rather than hardcoding a platform check.
 */
export async function hasAnyAvailableImportSource(
  sources: ContactSource[] = webContactSources,
): Promise<boolean> {
  const availability = await Promise.all(sources.map((source) => source.isAvailable()));
  return availability.some(Boolean);
}

export async function firstAvailableSource(
  sources: ContactSource[] = webContactSources,
): Promise<ContactSource | null> {
  for (const source of sources) {
    if (await source.isAvailable()) return source;
  }
  return null;
}
