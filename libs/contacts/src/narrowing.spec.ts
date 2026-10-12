import { describe, expect, it } from "vitest";
import { runImport } from "./importFlow.js";
import type { ContactSource, FetchedContact } from "./source.js";

/**
 * C4: wide provider objects die at the import boundary. A provider (or a future adapter)
 * may hand over far more than we ask for; none of it may come out of the pipeline.
 */
const KEPT = ["displayName", "email", "key", "phone", "starred"];

function wideSource(): ContactSource {
  const wide = {
    key: "a",
    displayName: "Carol Hayes",
    phones: ["+16175550101"],
    emails: ["carol@example.com"],
    starred: true,
    // What a real address book carries and the app must not keep.
    photoUrl: "https://example.com/carol.jpg",
    birthday: "1960-01-02",
    address: "12 Elm St, Boston",
    organization: "Hayes & Sons",
    notes: "allergic to lilies",
    providerId: "people/c123",
  } as FetchedContact;
  return { id: "device-picker", preselected: true, isAvailable: async () => true, fetch: async () => [wide] };
}

describe("runImport keeps only the narrow contact fields (C4)", () => {
  it("drops every extra provider field", async () => {
    const { fresh } = await runImport(wideSource(), new Set(), "US");
    expect(fresh).toHaveLength(1);
    expect(Object.keys(fresh[0]).sort()).toEqual(KEPT);
    expect(JSON.stringify(fresh)).not.toMatch(/elm st|lilies|1960|carol\.jpg|people\/c123|Hayes & Sons/i);
  });

  it("drops them for contacts that were already stored too", async () => {
    const { alreadyStored } = await runImport(wideSource(), new Set(["+16175550101"]), "US");
    expect(alreadyStored).toHaveLength(1);
    expect(Object.keys(alreadyStored[0]).sort()).toEqual(KEPT);
  });
});
