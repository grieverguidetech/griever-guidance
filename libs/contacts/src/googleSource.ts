import type { ContactSource } from "./source.js";

/**
 * Deferred: this adapter needs the Google People API contacts token from
 * `tasks/02-auth.md`, and that task is on hold (no social auth being built
 * right now). Kept as a typed placeholder — implementing `ContactSource` —
 * so the adapter registry stays complete and D1/D4 can render a "Google"
 * option's *absence* correctly (via `isAvailable()`) rather than needing a
 * special case. Do not wire this up to a real fetch until task 2 lands.
 *
 * When it does: fetch via `people.connections.list` (page past 1000 via
 * `nextPageToken`) and `people.otherContacts.list`, rank starred → mobile
 * -typed → last-modified (§5), and discard the OAuth token immediately
 * after the People API calls complete (task 2 §3) — it does not belong in
 * this adapter's return value or anywhere past this file.
 */
export const googleSource: ContactSource = {
  id: "google",
  preselected: false,
  async isAvailable() {
    return false;
  },
  async fetch() {
    throw new Error("google contacts source is not implemented (blocked on task 2 — Google auth)");
  },
};
