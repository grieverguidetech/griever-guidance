import { openDb } from "./db.js";

/** Numeric `meta` values shared between the main thread and the Service Worker (see db.ts). */
export async function getMetaNumber(key: "syncCursor" | "lastSyncAt"): Promise<number> {
  const db = await openDb();
  const record = await db.get("meta", key);
  return typeof record?.value === "number" ? record.value : 0;
}

export async function setMetaNumber(key: "syncCursor" | "lastSyncAt", value: number): Promise<void> {
  const db = await openDb();
  await db.put("meta", { key, value });
}

/** String `meta` values (device/session identity) shared with the Service Worker. */
export async function getMetaString(
  key: "deviceId" | "devUserId" | "gatewayUrl",
): Promise<string | null> {
  const db = await openDb();
  const record = await db.get("meta", key);
  return typeof record?.value === "string" ? record.value : null;
}

export async function setMetaString(
  key: "deviceId" | "devUserId" | "gatewayUrl",
  value: string,
): Promise<void> {
  const db = await openDb();
  await db.put("meta", { key, value });
}

export const metaStore = { getMetaNumber, setMetaNumber, getMetaString, setMetaString };
