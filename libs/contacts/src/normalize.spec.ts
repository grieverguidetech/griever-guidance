import { describe, expect, it } from "vitest";
import {
  dedupeByPhone,
  normalizeFetchedContact,
  partitionAlreadyStored,
  rankContacts,
  toE164,
  type NormalizedContact,
} from "./normalize.js";
import type { FetchedContact } from "./source.js";

describe("toE164", () => {
  it("normalizes a bare local number against the default region", () => {
    expect(toE164("(617) 555-0148", "US")).toBe("+16175550148");
  });

  it("passes through an already-E.164 number", () => {
    expect(toE164("+16175550148", "US")).toBe("+16175550148");
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(toE164("", "US")).toBeNull();
    expect(toE164("   ", "US")).toBeNull();
  });

  it("returns null for a number too short to be valid", () => {
    expect(toE164("555-0148", "US")).toBeNull();
  });

  it("returns null for garbage input rather than throwing", () => {
    expect(toE164("not a phone number", "US")).toBeNull();
  });
});

describe("normalizeFetchedContact", () => {
  const base: FetchedContact = {
    key: "k1",
    displayName: "Aunt Carol",
    phones: [],
    emails: [],
  };

  it("takes the first phone that normalizes, skipping invalid ones first in the list", () => {
    const result = normalizeFetchedContact(
      { ...base, phones: ["not-a-number", "+16175550101"] },
      "US",
    );
    expect(result?.phone).toBe("+16175550101");
  });

  it("returns null when no phone normalizes — D4 hides these, never greys them", () => {
    const result = normalizeFetchedContact({ ...base, phones: ["", "abc"] }, "US");
    expect(result).toBeNull();
  });

  it("returns null for a contact with no phones at all", () => {
    expect(normalizeFetchedContact(base, "US")).toBeNull();
  });

  it("takes the first non-blank email, trimmed", () => {
    const result = normalizeFetchedContact(
      { ...base, phones: ["+16175550101"], emails: ["  ", " carol@example.com "] },
      "US",
    );
    expect(result?.email).toBe("carol@example.com");
  });

  it("carries email null when every entry is blank", () => {
    const result = normalizeFetchedContact(
      { ...base, phones: ["+16175550101"], emails: ["  "] },
      "US",
    );
    expect(result?.email).toBeNull();
  });

  it("carries the starred flag through unchanged", () => {
    const result = normalizeFetchedContact(
      { ...base, phones: ["+16175550101"], starred: true },
      "US",
    );
    expect(result?.starred).toBe(true);
  });
});

describe("dedupeByPhone", () => {
  function contact(overrides: Partial<NormalizedContact>): NormalizedContact {
    return {
      key: "k",
      displayName: "Name",
      phone: "+16175550101",
      email: null,
      ...overrides,
    };
  }

  it("merges two entries with the same E.164 number into one", () => {
    const result = dedupeByPhone([
      contact({ key: "a", displayName: "Carol" }),
      contact({ key: "b", displayName: "Carol" }),
    ]);
    expect(result).toHaveLength(1);
  });

  it("never dedupes on name — only on phone", () => {
    const result = dedupeByPhone([
      contact({ key: "a", phone: "+16175550101", displayName: "Carol" }),
      contact({ key: "b", phone: "+16175550102", displayName: "Carol" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("keeps the longer display name on collision", () => {
    const [result] = dedupeByPhone([
      contact({ displayName: "Carol" }),
      contact({ displayName: "Aunt Carol Whitfield" }),
    ]);
    expect(result.displayName).toBe("Aunt Carol Whitfield");
  });

  it("fills in email from either side, preferring the existing one", () => {
    const [result] = dedupeByPhone([
      contact({ email: null }),
      contact({ email: "carol@example.com" }),
    ]);
    expect(result.email).toBe("carol@example.com");
  });

  it("ORs the starred flag across duplicates", () => {
    const [result] = dedupeByPhone([
      contact({ starred: false }),
      contact({ starred: true }),
    ]);
    expect(result.starred).toBe(true);
  });
});

describe("partitionAlreadyStored", () => {
  it("splits contacts into fresh and already-stored by E.164 phone", () => {
    const contacts: NormalizedContact[] = [
      { key: "a", displayName: "Carol", phone: "+16175550101", email: null },
      { key: "b", displayName: "David", phone: "+16175550102", email: null },
    ];
    const { fresh, alreadyStored } = partitionAlreadyStored(
      contacts,
      new Set(["+16175550101"]),
    );
    expect(fresh.map((c) => c.key)).toEqual(["b"]);
    expect(alreadyStored.map((c) => c.key)).toEqual(["a"]);
  });
});

describe("rankContacts", () => {
  it("sorts starred contacts first without mutating the input", () => {
    const input: NormalizedContact[] = [
      { key: "a", displayName: "A", phone: "+1", email: null, starred: false },
      { key: "b", displayName: "B", phone: "+2", email: null, starred: true },
      { key: "c", displayName: "C", phone: "+3", email: null, starred: false },
    ];
    const result = rankContacts(input);
    expect(result.map((c) => c.key)).toEqual(["b", "a", "c"]);
    expect(input.map((c) => c.key)).toEqual(["a", "b", "c"]);
  });
});
