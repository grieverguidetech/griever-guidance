import { afterEach, describe, expect, it } from "vitest";
import { devicePickerSource } from "./devicePickerSource.js";
import { Cancelled } from "./source.js";

function setContacts(select: (...args: unknown[]) => Promise<unknown>) {
  Object.defineProperty(navigator, "contacts", {
    configurable: true,
    value: { select },
  });
}

afterEach(() => {
  Object.defineProperty(navigator, "contacts", { configurable: true, value: undefined });
});

describe("devicePickerSource.isAvailable", () => {
  it("is true only when navigator.contacts.select exists", async () => {
    setContacts(async () => []);
    expect(await devicePickerSource.isAvailable()).toBe(true);
  });

  it("is false when navigator.contacts is absent", async () => {
    expect(await devicePickerSource.isAvailable()).toBe(false);
  });
});

describe("devicePickerSource.fetch", () => {
  it("maps ContactInfo entries to FetchedContact, defaulting a blank name", async () => {
    setContacts(async () => [
      { name: ["Aunt Carol"], tel: ["+16175550101"], email: ["carol@example.com"] },
      { name: [], tel: ["+16175550102"], email: [] },
    ]);
    const result = await devicePickerSource.fetch();
    expect(result).toEqual([
      { key: expect.any(String), displayName: "Aunt Carol", phones: ["+16175550101"], emails: ["carol@example.com"] },
      { key: expect.any(String), displayName: "Unnamed", phones: ["+16175550102"], emails: [] },
    ]);
  });

  it("throws Cancelled when the picker is dismissed (AbortError)", async () => {
    setContacts(async () => {
      throw new DOMException("dismissed", "AbortError");
    });
    await expect(devicePickerSource.fetch()).rejects.toBeInstanceOf(Cancelled);
  });

  it("rethrows any other error untouched", async () => {
    setContacts(async () => {
      throw new DOMException("no user gesture", "SecurityError");
    });
    await expect(devicePickerSource.fetch()).rejects.toMatchObject({ name: "SecurityError" });
  });

  it("throws when called without checking isAvailable first", async () => {
    await expect(devicePickerSource.fetch()).rejects.toThrow(/isAvailable/);
  });
});
