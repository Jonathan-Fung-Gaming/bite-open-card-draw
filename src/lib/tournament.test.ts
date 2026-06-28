import { describe, expect, it } from "vitest";
import { getSetsForRound, REQUIRED_ROUTES, ROUND_SET_DEFINITIONS } from "./tournament";

describe("Phase 1 tournament shell", () => {
  it("locks the required public routes", () => {
    expect(REQUIRED_ROUTES).toEqual([
      "/stage",
      "/room",
      "/vote",
      "/charts",
      "/results",
      "/coolguy69",
    ]);
  });

  it("defines the exact four-round chart set map", () => {
    expect(ROUND_SET_DEFINITIONS.map((set) => set.displayLabel)).toEqual([
      "S16",
      "S17",
      "S18",
      "S19",
      "S20",
      "S21",
      "S22",
      "D23",
    ]);
  });

  it("keeps each round at two sets with seven draws and two max bans", () => {
    for (const roundNumber of [1, 2, 3, 4] as const) {
      const sets = getSetsForRound(roundNumber);

      expect(sets).toHaveLength(2);
      expect(sets.every((set) => set.drawCount === 7)).toBe(true);
      expect(sets.every((set) => set.maxBans === 2)).toBe(true);
    }
  });
});
