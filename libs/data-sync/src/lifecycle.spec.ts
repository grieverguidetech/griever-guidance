import { describe, it, expect, beforeEach } from "vitest";
import type { SessionDocument, RemoteSessionRow } from "@griever/shared";
import { openDb, sessionStore, outboxStore, _resetDbConnectionForTests } from "@griever/data-local";
import { swapToSession, SWAP_FLUSH_FAILED_COPY, isSessionOpenable } from "./lifecycle.js";
import { createFailingTransport } from "./testHelpers/fakeServer.js";

function blankSession(sessionId: string): SessionDocument {
  return {
    schemaVersion: 1,
    sessionId,
    userId: "usr_test",
    createdAt: 1000,
    updatedAt: 1000,
    lastOpenedAt: 1000,
    status: "in_progress",
    screens: { L3: { status: "complete", updatedAt: 1000, values: { personName: "Current Person" } } },
    cursorScreen: "L3",
  };
}

beforeEach(async () => {
  _resetDbConnectionForTests();
  const db = await openDb();
  await db.clear("sessions");
  await db.clear("outbox");
});

describe("flush-then-swap failure (Test 6)", () => {
  it("refuses the swap and leaves the resident session untouched when the flush fails", async () => {
    const currentId = "ses_current";
    await sessionStore.put(blankSession(currentId));
    // Something unflushed in the outbox — this is exactly what would be lost.
    await outboxStore.add({
      sessionId: currentId,
      type: "session.upsert",
      patch: { screens: { A2: { status: "complete", updatedAt: 1500, values: { serviceDate: "June 14" } } } },
      baseUpdatedAt: 1500,
      createdAt: 1500,
      attempts: 0,
    });

    const targetRow: RemoteSessionRow = {
      schemaVersion: 1,
      sessionId: "ses_target",
      userId: "usr_test",
      createdAt: 2000,
      updatedAt: 2000,
      lastOpenedAt: 2000,
      status: "in_progress",
      screens: {},
      cursorScreen: null,
      personName: "Other Person",
      dateOfPassing: null,
      seq: 10,
      deletedAt: null,
      deviceId: "dev_other",
    };

    const result = await swapToSession(currentId, targetRow, createFailingTransport(), "dev_A");

    expect(result).toEqual({ ok: false, reason: SWAP_FLUSH_FAILED_COPY });

    // Nothing was lost or swapped: the resident session is still current,
    // the target never became resident, and the outbox is untouched.
    const stillResident = await sessionStore.get(currentId);
    expect(stillResident?.screens.L3?.values).toEqual({ personName: "Current Person" });
    const targetLocally = await sessionStore.get("ses_target");
    expect(targetLocally).toBeUndefined();
    const outbox = await outboxStore.list();
    expect(outbox).toHaveLength(1);
  });
});

describe("isSessionOpenable", () => {
  it("is openable once local contacts cover every referenced recipient id", () => {
    const row: Pick<RemoteSessionRow, "screens"> = {
      screens: {
        A3: { status: "complete", updatedAt: 1, values: { selectedContactIds: ["ctc_1", "ctc_2"] } },
      },
    };
    expect(isSessionOpenable(row, new Set(["ctc_1", "ctc_2"]))).toBe(true);
    expect(isSessionOpenable(row, new Set(["ctc_1"]))).toBe(false);
    expect(isSessionOpenable(row, new Set())).toBe(false);
  });

  it("is openable when no recipients have been recorded yet", () => {
    const row: Pick<RemoteSessionRow, "screens"> = { screens: {} };
    expect(isSessionOpenable(row, new Set())).toBe(true);
  });
});
