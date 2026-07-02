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

  it("persists private CSV export audit metadata as non-tournament-changing", () => {
    const store = new AdminAuditStore();

    store.record({
      sessionId: "session-1",
      action: "private_csv_export_denied",
      summary: "Denied Round 1 private CSV export because active host control is required.",
      tournamentChanging: false,
      metadata: { roundNumber: 1, reason: "host_lock_required" },
      now: "2026-07-02T00:00:00.000Z",
    });
    store.record({
      sessionId: "session-1",
      action: "private_csv_export",
      summary: "Downloaded Round 1 private ballot CSV.",
      tournamentChanging: false,
      affectedRecords: [{ type: "result", id: "result-1" }],
      metadata: {
        roundNumber: 1,
        filename: "event-round-1-private-ballots-2026-07-02T00-01-00-000Z-abc123.csv",
        ballotCount: 12,
      },
      now: "2026-07-02T00:01:00.000Z",
    });

    const restored = new AdminAuditStore();

    restored.importSnapshot(store.exportSnapshot());

    expect(restored.list(2)).toMatchObject([
      {
        action: "private_csv_export",
        dangerous: false,
        tournamentChanging: false,
        affectedRecords: [{ type: "result", id: "result-1" }],
        metadata: {
          roundNumber: 1,
          filename: "event-round-1-private-ballots-2026-07-02T00-01-00-000Z-abc123.csv",
          ballotCount: 12,
        },
      },
      {
        action: "private_csv_export_denied",
        dangerous: false,
        tournamentChanging: false,
        metadata: { roundNumber: 1, reason: "host_lock_required" },
      },
    ]);
  });
});
