import { describe, expect, it, vi } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { MAX_BANS_PER_SET, type RoundBallot } from "@/lib/vote/ballot";
import { buildAdminLiveCountRows } from "./live-counts";

vi.mock("server-only", () => ({}));

function chart(id: string): DrawnChartSummary {
  return {
    id,
    name: id,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey: `song-${id}`,
    chartKey: `chart-${id}`,
    sourceBgImg: "",
    localImagePath: "/chart-images/fallback-card.svg",
  };
}

function draw(id: string, setOrder: 1 | 2, displayLabel: string, chartPrefix: string): DrawRecord {
  return {
    id,
    roundSetId: `static-${displayLabel.toLowerCase()}`,
    roundNumber: 1,
    setOrder,
    displayLabel,
    version: 1,
    eligiblePoolCount: 7,
    charts: Array.from({ length: 7 }, (_, index) => chart(`${chartPrefix}-${index}`)),
    createdAt: "drawn",
    supersededAt: null,
    reason: "test",
  };
}

function ballot(playerId: string, setOneBans: string[], setTwoBans: string[]): RoundBallot {
  return {
    id: `ballot-${playerId}`,
    roundNumber: 1,
    playerId,
    playerStartggUsername: playerId,
    submittedAt: "submitted",
    revision: 1,
    source: "player",
    manualReason: null,
    manualOverride: false,
    replacedExistingBallot: false,
    choices: [
      {
        drawId: "draw-1",
        roundSetId: "static-s16",
        displayLabel: "S16",
        noBans: setOneBans.length === 0,
        bannedChartIds: setOneBans,
      },
      {
        drawId: "draw-2",
        roundSetId: "static-s17",
        displayLabel: "S17",
        noBans: setTwoBans.length === 0,
        bannedChartIds: setTwoBans,
      },
    ],
  };
}

describe("admin live counts", () => {
  it("keeps per-set and per-chart live ban counts within valid ballot maxima", () => {
    const draws = [draw("draw-1", 1, "S16", "a"), draw("draw-2", 2, "S17", "b")];
    const ballots = [
      ballot("p1", ["a-0", "a-1"], ["b-0", "b-1"]),
      ballot("p2", ["a-0", "a-2"], ["b-0", "b-2"]),
      ballot("p3", ["a-0", "a-3"], ["b-0", "b-3"]),
      ballot("p4", ["a-1", "a-2"], ["b-1", "b-2"]),
    ];
    const liveCounts = buildAdminLiveCountRows(draws, ballots);

    for (const set of liveCounts) {
      const setBanSelections = set.rows.reduce((total, row) => total + row.banCount, 0);

      expect(setBanSelections).toBeLessThanOrEqual(ballots.length * MAX_BANS_PER_SET);
      for (const row of set.rows) {
        expect(row.banCount).toBeLessThanOrEqual(ballots.length);
      }
    }
  });
});
