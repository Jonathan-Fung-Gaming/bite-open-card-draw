import { describe, expect, it } from "vitest";
import { AdminAuditStore } from "./audit";

describe("admin audit store", () => {
  it("records dangerous tournament-changing action details", () => {
    const store = new AdminAuditStore();

    const record = store.record({
      sessionId: "session-1",
      action: "reroll_round_set",
      summary: "Rerolled Round 1 - S16.",
      reason: "bad chart metadata",
      dangerous: true,
      affectedRecords: [{ type: "draw", id: "draw-1" }],
      metadata: { roundNumber: 1, setOrder: 1 },
      now: "2026-06-28T00:00:00.000Z",
    });

    expect(record.dangerous).toBe(true);
    expect(record.tournamentChanging).toBe(true);
    expect(record.reason).toBe("bad chart metadata");
    expect(record.affectedRecords).toEqual([{ type: "draw", id: "draw-1" }]);
    expect(store.list()).toHaveLength(1);
  });

  it("preserves chart exclusion display snapshots in audit metadata", () => {
    const store = new AdminAuditStore();

    store.record({
      sessionId: "session-1",
      action: "chart_exclusion_add",
      summary: "Excluded S16 chart Example Song.",
      reason: "event rule exclusion",
      dangerous: true,
      affectedRecords: [{ type: "chart", id: "chart-1" }],
      metadata: {
        chartId: "chart-1",
        chartKey: "example-song|artist|s|16",
        chartName: "Example Song",
        artist: "Artist",
        label: "Arcade",
        chartType: "s",
        level: 16,
        displayDifficulty: "S16",
        songKey: "example-song|artist",
        sourceBgImg: "https://example.test/example.png",
        sourceRowNumber: 42,
      },
      now: "2026-06-28T00:00:00.000Z",
    });

    expect(store.list()[0]?.metadata).toMatchObject({
      chartName: "Example Song",
      artist: "Artist",
      displayDifficulty: "S16",
      sourceRowNumber: 42,
    });
  });
});
