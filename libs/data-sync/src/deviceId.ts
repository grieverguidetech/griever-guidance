import { metaStore } from "@griever/data-local";

function generateDeviceId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `dev_${random}`;
}

/** A stable per-device id, generated once and persisted (used as the sync idempotency key's prefix). */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await metaStore.getMetaString("deviceId");
  if (existing) return existing;
  const created = generateDeviceId();
  await metaStore.setMetaString("deviceId", created);
  return created;
}
