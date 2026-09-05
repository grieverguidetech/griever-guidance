import { describe, it, expect, beforeEach } from "vitest";
import type { SessionDocument } from "@griever/shared";
import { openDb, _resetDbConnectionForTests } from "./db.js";
import { sessionStore } from "./sessionStore.js";

function freshSession(sessionId: string): SessionDocument {
  return {
    schemaVersion: 1,
    sessionId,
    userId: "usr_test",
    createdAt: 1000,
    updatedAt: 1000,
    lastOpenedAt: 1000,
    status: "in_progress",
    screens: {},
    cursorScreen: "B1",
  };
}

async function reload() {
  // Simulates a force-quit + relaunch: drop the cached connection and any
  // debounced-but-unflushed in-memory state, then reopen.
  await sessionStore.flushNow("ses_1");
  _resetDbConnectionForTests();
  await openDb();
}

describe("cold offline start (Test 1)", () => {
  const sessionId = "ses_1";

  beforeEach(async () => {
    _resetDbConnectionForTests();
    const db = await openDb();
    await db.clear("sessions");
  });

  it("keeps every value present and resumes on cursorScreen after a force-quit + relaunch", async () => {
    await sessionStore.put(freshSession(sessionId));

    await sessionStore.upsertScreen(sessionId, "B1", {
      status: "complete",
      values: { personalNote: "She was peaceful." },
    });
    await sessionStore.upsertScreen(sessionId, "B2", {
      status: "complete",
      values: { serviceDetailsKnown: false },
    });
    await sessionStore.upsertScreen(sessionId, "B3", {
      status: "complete",
      values: { selectedContactIds: ["ctc_1", "ctc_2"] },
    });
    await sessionStore.upsertScreen(sessionId, "B4", {
      status: "complete",
      values: { messageOverride: null, tone: "default" },
    });
    await sessionStore.upsertScreen(sessionId, "B5", {
      status: "complete",
      values: { sendJobId: "job_1" },
    });
    await sessionStore.setCursorScreen(sessionId, "B5");
    await sessionStore.setStatus(sessionId, "sent");

    await reload();

    const restored = await sessionStore.get(sessionId);
    expect(restored).toBeDefined();
    expect(restored!.cursorScreen).toBe("B5");
    expect(restored!.status).toBe("sent");
    expect(restored!.screens.B1?.values).toEqual({ personalNote: "She was peaceful." });
    expect(restored!.screens.B2?.values).toEqual({ serviceDetailsKnown: false });
    expect(restored!.screens.B3?.values).toEqual({ selectedContactIds: ["ctc_1", "ctc_2"] });
    expect(restored!.screens.B4?.values).toEqual({ messageOverride: null, tone: "default" });
    expect(restored!.screens.B5?.values).toEqual({ sendJobId: "job_1" });
    for (const key of ["B1", "B2", "B3", "B4", "B5"]) {
      expect(restored!.screens[key]?.status).toBe("complete");
    }
  });
});
