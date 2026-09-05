import { describe, expect, it } from "vitest";
import { runImport } from "./importFlow.js";
import { Cancelled, type ContactSource, type FetchedContact } from "./source.js";

function sourceReturning(contacts: FetchedContact[]): ContactSource {
  return {
    id: "device-picker",
    preselected: true,
    async isAvailable() {
      return true;
    },
    async fetch() {
      return contacts;
    },
  };
}

describe("runImport", () => {
  it("normalizes, dedupes, ranks, and partitions in one pass", async () => {
    const source = sourceReturning([
      { key: "a", displayName: "Carol", phones: ["+16175550101"], emails: [], starred: false },
      { key: "b", displayName: "Carol", phones: ["+16175550101"], emails: [], starred: true }, // dupes with a
      { key: "c", displayName: "No Phone", phones: [], emails: [] }, // dropped — no valid number
      { key: "d", displayName: "David", phones: ["+16175550102"], emails: [] },
    ]);

    const result = await runImport(source, new Set(), "US");

    // c is dropped (no valid phone), a+b merge into one starred entry ranked first.
    expect(result.fresh).toHaveLength(2);
    expect(result.fresh[0].phone).toBe("+16175550101");
    expect(result.fresh[0].starred).toBe(true);
    expect(result.fresh[1].phone).toBe("+16175550102");
    expect(result.alreadyStored).toHaveLength(0);
  });

  it("routes already-stored phones to alreadyStored, not fresh", async () => {
    const source = sourceReturning([
      { key: "a", displayName: "Carol", phones: ["+16175550101"], emails: [] },
      { key: "b", displayName: "David", phones: ["+16175550102"], emails: [] },
    ]);

    const result = await runImport(source, new Set(["+16175550101"]), "US");

    expect(result.fresh.map((c) => c.phone)).toEqual(["+16175550102"]);
    expect(result.alreadyStored.map((c) => c.phone)).toEqual(["+16175550101"]);
  });

  it("propagates Cancelled from the source untouched — not swallowed as an empty result", async () => {
    const source: ContactSource = {
      id: "device-picker",
      preselected: true,
      async isAvailable() {
        return true;
      },
      async fetch() {
        throw new Cancelled();
      },
    };

    await expect(runImport(source, new Set(), "US")).rejects.toBeInstanceOf(Cancelled);
  });
});
