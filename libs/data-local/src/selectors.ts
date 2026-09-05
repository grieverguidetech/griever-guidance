import type { SessionDocument } from "@griever/shared";

/**
 * Read-only projections over `screens.*.values` (DATA.md §2 rule 1). A screen
 * never reads another screen's `values` directly, and no value is ever
 * duplicated into a second screen key — these selectors are the only
 * sanctioned way to read a value owned by a different screen.
 */

export interface PersonInfo {
  personName: string;
  dateOfPassing: string;
  senderName?: string;
}

/** The person's details, owned by L3 and nowhere else. */
export function selectPerson(session: SessionDocument): PersonInfo {
  const values = session.screens["L3"]?.values as Partial<PersonInfo> | undefined;
  return {
    personName: values?.personName ?? "",
    dateOfPassing: values?.dateOfPassing ?? "",
    senderName: values?.senderName,
  };
}

/**
 * Contact ids owned by one screen (`selectedContactIds` on A3/A4/B3/C5,
 * `hearsFirstIds` on D5). Never a copy of another screen's list.
 */
export function selectRecipients(session: SessionDocument, screenKey: string): string[] {
  const values = session.screens[screenKey]?.values as Record<string, unknown> | undefined;
  if (!values) return [];
  const candidate = values["selectedContactIds"] ?? values["hearsFirstIds"];
  return Array.isArray(candidate) ? candidate.filter((v): v is string => typeof v === "string") : [];
}

export interface SelectorMoment {
  key: string;
  status: "done" | "next" | "later";
  completedAt?: number;
  recipientCount?: number;
}

/** The single `next` moment from C1's path, or null once every moment is done. */
export function selectNextMoment(session: SessionDocument): SelectorMoment | null {
  const values = session.screens["C1"]?.values as { moments?: SelectorMoment[] } | undefined;
  const moments = values?.moments ?? [];
  return moments.find((m) => m.status === "next") ?? null;
}
