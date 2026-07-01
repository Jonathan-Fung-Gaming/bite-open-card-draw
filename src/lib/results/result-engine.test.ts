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
    roundSetId: `static-${displayLabel.toLowerCase()}`,
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

function sevenCharts(prefix: string) {
  return Array.from({ length: 7 }, (_, index) =>
    chart(`${prefix}-${index}`, `${prefix.toUpperCase()} ${index}`),
  );
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

describe("result engine", () => {
  it("includes zero-ban charts and selects the unique least-banned chart", () => {
    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", [
          chart("a", "Alpha"),
          chart("b", "Bravo"),
          chart("c", "Charlie"),
          chart("d", "Delta"),
          chart("e", "Echo"),
          chart("f", "Foxtrot"),
          chart("g", "Golf"),
        ]),
        draw("draw-2", 2, "S17", sevenCharts("set-two")),
      ],
      ballots: [
        ballot("p1", ["a", "d"]),
        ballot("p2", ["a", "e"]),
        ballot("p3", ["b", "f"]),
        ballot("p4", ["g"]),
      ],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      computedAt: "now",
    });

    expect(result.sets[0].rows).toHaveLength(7);
    expect(result.sets[0].rows[0]).toMatchObject({ banCount: 0 });
    expect(result.sets[0].rows[0]?.chart.name).toBe("Charlie");
    expect(result.sets[0].selectedChart.name).toBe("Charlie");
    expect(result.sets[0].tiebreakUsed).toBe(false);
  });

  it("uses a backend-decided tiebreak and builds a 12-slot wheel for 2-4 tied charts", () => {
    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", [
          chart("a", "Alpha"),
          chart("b", "Bravo"),
          chart("c", "Charlie"),
          chart("d", "Delta"),
          chart("e", "Echo"),
          chart("f", "Foxtrot"),
          chart("g", "Golf"),
        ]),
        draw("draw-2", 2, "S17", sevenCharts("set-two")),
      ],
      ballots: [ballot("p1", ["c", "d"]), ballot("p2", ["e", "f"]), ballot("p3", ["g"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      computedAt: "now",
      randomIndex: () => 1,
    });

    expect(result.sets[0].tiebreakUsed).toBe(true);
    expect(result.sets[0].drawId).toBe("draw-1");
    expect(result.sets[0].roundSetId).toBe("static-s16");
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

  it("rejects malformed round draws that do not contain exactly seven charts per set", () => {
    expect(() =>
      computeRoundResult({
        id: "result",
        roundNumber: 1,
        draws: [
          draw("draw-1", 1, "S16", [chart("a", "Alpha")]),
          draw("draw-2", 2, "S17", sevenCharts("set-two")),
        ],
        ballots: [],
        eligiblePlayers: [],
        computedAt: "now",
      }),
    ).toThrow(/exactly 7 charts/);
  });

  it("uses a seven-chart wheel for true zero-ballot sets", () => {
    const setOneCharts = Array.from({ length: 7 }, (_, index) =>
      chart(`a-${index}`, `Alpha ${index}`),
    );
    const setTwoCharts = Array.from({ length: 7 }, (_, index) =>
      chart(`b-${index}`, `Bravo ${index}`),
    );

    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", setOneCharts),
        draw("draw-2", 2, "S17", setTwoCharts),
      ],
      ballots: [],
      eligiblePlayers: [],
      computedAt: "now",
      randomIndex: () => 3,
    });

    expect(result.sets[0].tiebreakUsed).toBe(true);
    expect(result.sets[0].zeroBallotTiebreak).toBe(true);
    expect(result.sets[0].tiebreakCandidateIds).toHaveLength(7);
    expect(result.sets[0].selectedChart.id).toBe("a-3");
    expect(result.sets[0].wheelSupported).toBe(true);
    expect(result.sets[0].wheelSlots.map((slot) => slot.id)).toEqual(
      setOneCharts.map((candidate) => candidate.id),
    );
    expect(result.sets[1].selectedChart.id).toBe("b-3");
    expect(result.sets[1].wheelSlots).toHaveLength(7);
  });

  it("keeps non-zero 5+ least-ban ties on the fallback reveal", () => {
    const setOneCharts = Array.from({ length: 7 }, (_, index) =>
      chart(`a-${index}`, `Alpha ${index}`),
    );
    const setTwoCharts = Array.from({ length: 7 }, (_, index) =>
      chart(`b-${index}`, `Bravo ${index}`),
    );

    const result = computeRoundResult({
      id: "result",
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", setOneCharts),
        draw("draw-2", 2, "S17", setTwoCharts),
      ],
      ballots: [ballot("p1", ["a-6"], ["b-6"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      computedAt: "now",
      randomIndex: () => 0,
    });

    expect(result.sets[0].tiebreakCandidateIds).toHaveLength(6);
    expect(result.sets[0].zeroBallotTiebreak).toBe(false);
    expect(result.sets[0].wheelSupported).toBe(false);
    expect(result.sets[0].wheelSlots).toEqual([]);
  });
});
