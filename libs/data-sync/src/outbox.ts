import { outboxStore, sessionStore, clampedNow, type OutboxOp } from "@griever/data-local";
import type { ScreenEntry } from "@griever/shared";

function mergePatch(a: OutboxOp["patch"], b: OutboxOp["patch"]): OutboxOp["patch"] {
  const screens = { ...a.screens };
  for (const [key, entry] of Object.entries(b.screens ?? {})) {
    const existing = screens[key];
    screens[key] = existing
      ? {
          status: entry.status,
          updatedAt: entry.updatedAt,
          values: { ...existing.values, ...entry.values },
        }
      : entry;
  }
  return { ...a, ...b, screens };
}

/**
 * Appends an op, coalescing with the most recent still-unflushed op for the
 * same session (§4.3) so a burst of keystrokes becomes one op — sending 200
 * ops for one form is the most common way this pattern gets slow.
 */
export async function appendOp(sessionId: string, patch: OutboxOp["patch"], now: number): Promise<void> {
  const last = await outboxStore.getLastForSession(sessionId);
  if (last && last.type === "session.upsert") {
    await outboxStore.update({
      ...last,
      patch: mergePatch(last.patch, patch),
      baseUpdatedAt: now,
    });
    return;
  }
  await outboxStore.add({
    sessionId,
    type: "session.upsert",
    patch,
    baseUpdatedAt: now,
    createdAt: now,
    attempts: 0,
  });
}

/**
 * The one entry point a screen should call to edit a value: appends the op
 * *before* applying it locally (§4.3's ordering), using a single clamped
 * timestamp for both so they can never disagree.
 */
export async function recordScreenEdit(
  sessionId: string,
  screenKey: string,
  patch: Partial<Pick<ScreenEntry, "status" | "values">>,
): Promise<void> {
  const now = await clampedNow();
  const existing = await sessionStore.get(sessionId);
  const status = patch.status ?? existing?.screens[screenKey]?.status ?? "pending";
  await appendOp(
    sessionId,
    { screens: { [screenKey]: { status, updatedAt: now, values: patch.values } } },
    now,
  );
  await sessionStore.upsertScreen(sessionId, screenKey, patch, now);
}
