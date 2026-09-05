import { describe, it, expect } from "vitest";
import { clampTimestamp } from "./clock.js";

describe("clampTimestamp", () => {
  it("uses now when the device clock is ahead of the last known server time", () => {
    expect(clampTimestamp(2000, 1000)).toBe(2000);
  });

  it("clamps forward when the device clock is skewed behind (Test 5)", () => {
    const lastKnownServerTime = 1_780_000_000_000;
    const threeDaysAgo = lastKnownServerTime - 3 * 24 * 60 * 60 * 1000;
    expect(clampTimestamp(threeDaysAgo, lastKnownServerTime)).toBe(lastKnownServerTime + 1);
  });
});
