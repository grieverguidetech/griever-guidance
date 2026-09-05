import { openDb } from "./db.js";

/**
 * Account-scoped, outlives any one session (DATA.md §2.1). The C3 checklist
 * promise is absolute: a persisted tick may only ever be read back onto C3
 * itself — never notify, never nag, never badge, never count. Don't add a
 * reader for this anywhere else.
 */

export async function getChecklistTicks(): Promise<string[]> {
  const db = await openDb();
  const record = await db.get("account", "checklistTicks");
  return Array.isArray(record?.value) ? (record.value as string[]) : [];
}

export async function setChecklistTicks(ticks: string[]): Promise<void> {
  const db = await openDb();
  await db.put("account", { key: "checklistTicks", value: ticks });
}

export async function getSenderName(): Promise<string | null> {
  const db = await openDb();
  const record = await db.get("account", "senderName");
  return typeof record?.value === "string" ? record.value : null;
}

export async function setSenderName(name: string): Promise<void> {
  const db = await openDb();
  await db.put("account", { key: "senderName", value: name });
}

export const accountStore = {
  getChecklistTicks,
  setChecklistTicks,
  getSenderName,
  setSenderName,
};
