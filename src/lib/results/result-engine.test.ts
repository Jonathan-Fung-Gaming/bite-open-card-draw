import { describe, expect, it } from "vitest";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { RoundBallot } from "@/lib/vote/ballot";
import { computeRoundResult } from "./result-engine";

function chart(id: string, name: string): DrawnChartSummary {
  return {
    id,
    name,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey: `song-${id}`,
    chartKey: `chart-${id}`,
    sourceBgImg: "",
    localImagePath: "/chart-images/fallback-card.svg",
  };
}

function draw(id: string, setOrder: 1 | 2, displayLabel: string, charts: DrawnChartSummary[]): DrawRecord {
  return {
    id,
    roundNumber: 1,
    setOrder,
    displayLabel,
    version: 1,
    eligiblePoolCount: charts.length,
    charts,
    createdAt: "drawn",
    supersededAt: null,
    reason: "test",
  };
}

function ballot(playerId: string, setOneBans: string[], setTwoBans: string[] = []): RoundBallot {
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
      { roundSetId: "set-1", displayLabel: "S16", noBans: setOneBans.length === 0, bannedChartIds: setOneBans },
      { roundSetId: "set-2", displayLabel: "S17", noBans: setTwoBans.length === 0, bannedChartIds: setTwoBans },
    ],
  };
}

describe("result engine", () => {
  it("includes zero-ban charts and selects the unique least-banned chart", () => {
    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("set-1", 1, "S16", [chart("a", "Alpha"), chart("b", "Bravo"), chart("c", "Charlie")]),
        draw("set-2", 2, "S17", [chart("d", "Delta"), chart("e", "Echo"), chart("f", "Foxtrot")]),
      ],
      ballots: [ballot("p1", ["a"]), ballot("p2", ["a"]), ballot("p3", ["b"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      computedAt: "now",
    });

    expect(result.sets[0].rows.map((row) => [row.chart.name, row.banCount])).toEqual([
      ["Charlie", 0],
      ["Bravo", 1],
      ["Alpha", 2],
    ]);
    expect(result.sets[0].selectedChart.name).toBe("Charlie");
    expect(result.sets[0].tiebreakUsed).toBe(false);
  });

  it("uses a backend-decided tiebreak and builds a 12-slot wheel for 2-4 tied charts", () => {
    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("set-1", 1, "S16", [chart("a", "Alpha"), chart("b", "Bravo"), chart("c", "Charlie")]),
        draw("set-2", 2, "S17", [chart("d", "Delta"), chart("e", "Echo"), chart("f", "Foxtrot")]),
      ],
      ballots: [ballot("p1", ["c"]), ballot("p2", ["c"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      computedAt: "now",
      randomIndex: () => 1,
    });

    expect(result.sets[0].tiebreakUsed).toBe(true);
    expect(result.sets[0].tiebreakCandidateIds).toEqual(["a", "b"]);
    expect(result.sets[0].selectedChart.name).toBe("Bravo");
    expect(result.sets[0].wheelSlots).toHaveLength(12);
    expect(result.sets[0].wheelSlots.slice(0, 4).map((slot) => slot.name)).toEqual([
      "Alpha",
      "Bravo",
      "Alpha",
      "Bravo",
    ]);
  });
});
