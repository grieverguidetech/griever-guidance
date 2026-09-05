import type { SessionDocument } from "@griever/shared";

/**
 * DATA.md §2 rule 5 — adding a screen is additive and needs no migration at
 * all (unknown screen keys pass through read/merge/write untouched, which is
 * just... not touching them; there's nothing to write here for that case).
 * `schemaVersion` bumps only for renames or value-shape changes, each with a
 * forward-only migration keyed by the version it migrates *from*.
 */
export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (doc: SessionDocument) => SessionDocument;

/** Keyed by the version a document is currently at; each entry migrates it one step forward. */
const migrations: Record<number, Migration> = {
  // 1: (doc) => ({ ...doc, schemaVersion: 2, /* ...renamed/reshaped fields... */ }),
};

/** Applies every migration needed to bring `doc` up to `CURRENT_SCHEMA_VERSION`, in order. */
export function migrateSession(doc: SessionDocument): SessionDocument {
  let current = doc;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[current.schemaVersion];
    if (!migrate) {
      // No migration registered for this version — leave it as-is rather
      // than guess. An old client's data must never be destroyed by a
      // migration gap; a missing step is a bug to fix, not to paper over.
      break;
    }
    current = migrate(current);
  }
  return current;
}
