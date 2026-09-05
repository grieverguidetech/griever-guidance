import { describe, it, expect, beforeEach } from "vitest";
import type { RemoteSessionRow } from "@griever/shared";
import { openDb, metaStore, _resetDbConnectionForTests } from "@griever/data-local";
import { pullLoop } from "./cursorClient.js";
import { createFakeServer } from "./testHelpers/fakeServer.js";

function makeRow(seq: number): RemoteSessionRow {
  return {
    schemaVersion: 1,
    sessionId: `ses_${seq}`,
    userId: "usr_test",
    createdAt: seq,
    updatedAt: seq,
    lastOpenedAt: seq,
    status: "in_progress",
    screens: {},
    cursorScreen: null,
    personName: `Person ${seq}`,
    dateOfPassing: null,
    seq,
    deletedAt: null,
    deviceId: "dev_seed",
  };
}

beforeEach(async () => {
  _resetDbConnectionForTests();
  const db = await openDb();
  await db.clear("sessions");
  await db.clear("outbox");
  await db.clear("meta");
});

describe("cursor gap (Test 2)", () => {
  it("pages through 250 rows with no duplicates, no gaps, and a final cursor at the max seq", async () => {
    const server = createFakeServer();
    server.seedRows(Array.from({ length: 250 }, (_, i) => makeRow(i + 1)));

    const seenSeqs: number[] = [];
    const trackingTransport = {
      ...server.transport,
      pull: async (args: Parameters<typeof server.transport.pull>[0]) => {
        const result = await server.transport.pull(args);
        for (const row of result.sessions) seenSeqs.push(row.seq);
        return result;
      },
    };

    await pullLoop(trackingTransport);

    expect(server.pullCallCount).toBe(3); // 100 + 100 + 50
    expect(seenSeqs).toHaveLength(250);
    expect(new Set(seenSeqs).size).toBe(250); // no duplicates
    expect(Math.max(...seenSeqs)).toBe(250);
    expect(await metaStore.getMetaNumber("syncCursor")).toBe(250);
  });
});

describe("idempotent replay (Test 3)", () => {
  it("applying the same batch twice yields one row version and one seq", async () => {
    const server = createFakeServer();
    const pushArgs = {
      deviceId: "dev_A",
      ops: [
        {
          opId: "op1",
          sessionId: "ses_1",
          type: "session.upsert" as const,
          patch: {
            personName: "Margaret Hayes",
            screens: {
              L3: { status: "complete" as const, updatedAt: 1000, values: { personName: "Margaret Hayes" } },
            },
          },
          createdAt: 1000,
        },
      ],
    };

    const first = await server.transport.push(pushArgs);
    expect(server.pushCallCount).toBe(1);
    const rowAfterFirst = server.getRow("ses_1");
    expect(rowAfterFirst?.seq).toBe(1);

    // Drop the response, push the identical batch again.
    const second = await server.transport.push(pushArgs);
    expect(server.pushCallCount).toBe(2);
    expect(second.acks).toEqual(first.acks);

    const rowAfterReplay = server.getRow("ses_1");
    expect(rowAfterReplay?.seq).toBe(1); // no new seq assigned
    expect(rowAfterReplay).toEqual(rowAfterFirst); // no new row version
  });
});
