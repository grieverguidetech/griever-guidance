import type { ContactRecordSource } from "@griever/shared";

/**
 * libs/contacts/source.ts — the boundary where wide provider objects die
 * (tasks/03-contacts.md §3). A `FetchedContact` lives in memory only, for
 * exactly as long as D4 is open, and is never persisted. What survives past
 * D4's Continue is the narrow `Contact` type in `@griever/shared`, written
 * once, in one transaction — see `libs/data-local`'s `contactStore.putMany`.
 */
export interface FetchedContact {
  /** Adapter-local, for selection state only — never stored. */
  key: string;
  displayName: string;
  /** Raw, unnormalized — normalize.ts owns turning these into E.164. */
  phones: string[];
  emails: string[];
  /** Ranking signal only (§5) — never stored. */
  starred?: boolean;
}

export interface ContactSource {
  id: ContactRecordSource;
  /** Capability-detected, never UA-sniffed. */
  isAvailable(): Promise<boolean>;
  /** May open a picker; may throw `Cancelled`. */
  fetch(): Promise<FetchedContact[]>;
  /** True for picker sources — the OS/browser already was D4's select step. */
  preselected: boolean;
}

/** Thrown by a `fetch()` the user backed out of — not an error, just "nothing chosen." */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "Cancelled";
  }
}
