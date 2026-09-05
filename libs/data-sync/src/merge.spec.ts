import { describe, it, expect, beforeEach } from "vitest";
import type { SessionDocument } from "@griever/shared";
import { openDb, sessionStore, _resetDbConnectionForTests } from "@griever/data-local";
import { flush } from "./cursorClient.js";
import { recordScreenEdit } from "./outbox.js";
import { applyRemoteRow } from "./merge.js";
import { createFakeServer } from "./testHelpers/fakeServer.js";
import { createFakeStorage } from "./testHelpers/fakeStorage.js";

function blankSession(sessionId: string): SessionDocument {
  return {
    schemaVersion: 1,
    sessionId,
    userId: "usr_test",
    createdAt: 1000,
    updatedAt: 1000,
    lastOpenedAt: 1000,
    status: "in_progress",
    screens: {},
    cursorScreen: null,
  };
}

beforeEach(async () => {
  _resetDbConnectionForTests();
  const db = await openDb();
  await db.clear("sessions");
  await db.clear("outbox");
});

describe("two-device merge (Test 4)", () => {
  it("both screens survive when device A fills A2 and device B fills B1, both offline, both flush", async () => {
    const server = createFakeServer();
    const sessionId = "ses_shared";

    // Device A: works offline, fills A2, then comes online and flushes.
    await sessionStore.put(blankSession(sessionId));
    await recordScreenEdit(sessionId, "A2", {
      status: "complete",
      values: { serviceDate: "June 14, 2026" },
    });
    const storageA = createFakeStorage();
    await flush(server.transport, "dev_A", storageA);

    // Device B: a separate device, starts from the same (pre-A2) server
    // state via pull, then fills B1 independently, offline, and flushes.
    _resetDbConnectionForTests();
    const dbB = await openDb();
    await dbB.clear("sessions");
    await dbB.clear("outbox");
    // Device B never saw A2 — it only pulled the row as it existed before A2.
    await sessionStore.put(blankSession(sessionId));
    await recordScreenEdit(sessionId, "B1", {
      status: "complete",
      values: { personalNote: "We were with her." },
    });
    const storageB = createFakeStorage();
    await flush(server.transport, "dev_B", storageB);

    // The server now has both screens merged onto one row.
    const merged = server.getRow(sessionId);
    expect(merged?.screens.A2?.values).toEqual({ serviceDate: "June 14, 2026" });
    expect(merged?.screens.B1?.values).toEqual({ personalNote: "We were with her." });

    // And pulling it down anywhere reflects both.
    const pulled = await server.transport.pull({ cursor: 0 });
    const finalRow = pulled.sessions.find((r) => r.sessionId === sessionId)!;
    expect(finalRow.screens.A2).toBeDefined();
    expect(finalRow.screens.B1).toBeDefined();
  });
});

describe("skewed clock does not win a merge (Test 5)", () => {
  it("a screen clamped from a skewed-behind device still loses to a genuinely newer one", async () => {
    const sessionId = "ses_skew";
    await sessionStore.put(blankSession(sessionId));

    // A genuinely recent write (e.g. pulled from another device).
    await applyRemoteRow({
      schemaVersion: 1,
      sessionId,
      userId: "usr_test",
      createdAt: 1000,
      updatedAt: 2_000_000,
      lastOpenedAt: 1000,
      status: "in_progress",
      screens: { A2: { status: "complete", updatedAt: 2_000_000, values: { serviceDate: "June 14, 2026" } } },
      cursorScreen: null,
      personName: null,
      dateOfPassing: null,
      seq: 5,
      deletedAt: null,
      deviceId: "dev_other",
    });

    // This device's clock is skewed 3 days behind, but its clamped write
    // (see clock.spec.ts for the pure clamp behavior) still can't beat a
    // screen that's already newer than its clamp floor.
    const skewedUpdatedAt = 2_000_000 - 3 * 24 * 60 * 60 * 1000;
    await applyRemoteRow({
      schemaVersion: 1,
      sessionId,
      userId: "usr_test",
      createdAt: 1000,
      updatedAt: skewedUpdatedAt,
      lastOpenedAt: 1000,
      status: "in_progress",
      screens: { A2: { status: "pending", updatedAt: skewedUpdatedAt, values: { serviceDate: "SKEWED, SHOULD NOT WIN" } } },
      cursorScreen: null,
      personName: null,
      dateOfPassing: null,
      seq: 6,
      deletedAt: null,
      deviceId: "dev_skewed",
    });

    const final = await sessionStore.get(sessionId);
    expect(final?.screens.A2?.values).toEqual({ serviceDate: "June 14, 2026" });
  });
});
