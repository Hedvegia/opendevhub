import { describe, expect, it } from "vitest";

import { isStalePull } from "../../../../src/web/features/forgejo/stale-pull";

const now = Date.parse("2026-10-13T12:00:00Z");

describe("stale pull requests", () => {
  it("requires two full days without activity", () => {
    expect(
      isStalePull({ state: "open", updatedAt: "2026-10-11T12:00:00.001Z" }, now)
    ).toBe(false);
    expect(
      isStalePull({ state: "open", updatedAt: "2026-10-11T12:00:00Z" }, now)
    ).toBe(true);
    expect(
      isStalePull({ state: "open", updatedAt: "2026-10-10T12:00:00Z" }, now)
    ).toBe(true);
  });

  it("clears staleness after new activity", () => {
    expect(
      isStalePull({ state: "open", updatedAt: "2026-10-13T11:59:00Z" }, now)
    ).toBe(false);
  });

  it("excludes closed and merged pull requests", () => {
    for (const state of ["closed", "merged"] as const) {
      expect(
        isStalePull({ state, updatedAt: "2026-10-01T00:00:00Z" }, now)
      ).toBe(false);
    }
  });

  it("does not mark missing, invalid or future activity timestamps as stale", () => {
    for (const updatedAt of ["", "invalid", "2026-10-14T00:00:00Z"]) {
      expect(isStalePull({ state: "open", updatedAt }, now)).toBe(false);
    }
  });
});
