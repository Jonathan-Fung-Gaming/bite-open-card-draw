import { describe, expect, it } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundBallot } from "@/lib/vote/ballot";
import { TIEBREAK_REVEAL_DURATION_MS } from "./reveal-timing";
import { ResultStore } from "./result-store";

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

describe("result store reveal timing", () => {
  it("keeps a backend-decided tiebreak winner sealed for five seconds", () => {
    const store = new ResultStore(() => 1);
    const computedAt = "2026-06-28T00:00:00.000Z";
    const setOneResolvedAt = "2026-06-28T00:00:02.000Z";

    const result = store.computeRound({
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", [chart("a", "Alpha"), chart("b", "Bravo"), chart("c", "Charlie")]),
        draw("draw-2", 2, "S17", [chart("d", "Delta"), chart("e", "Echo"), chart("f", "Foxtrot")]),
      ],
      ballots: [ballot("p1", ["c"]), ballot("p2", ["c"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      now: computedAt,
    });

    expect(result.sets[0].selectedChart.name).toBe("Bravo");
    expect(result.sets[0].winnerRevealStartedAt).toBeNull();

    store.advanceReveal(1, "2026-06-28T00:00:01.000Z");
    const resolved = store.advanceReveal(1, setOneResolvedAt);

    expect(resolved.revealPhase).toBe("set_1_resolved");
    expect(resolved.sets[0].winnerRevealStartedAt).toBe(setOneResolvedAt);
    expect(() => store.advanceReveal(1, "2026-06-28T00:00:04.000Z")).toThrow(
      /tiebreak reveal/,
    );

    const afterReveal = new Date(
      Date.parse(setOneResolvedAt) + TIEBREAK_REVEAL_DURATION_MS,
    ).toISOString();

    expect(store.advanceReveal(1, afterReveal).revealPhase).toBe("set_2_counts");
  });

  it("overrides a selected chart as an emergency correction", () => {
    const store = new ResultStore(() => 0);

    const result = store.computeRound({
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", [chart("a", "Alpha"), chart("b", "Bravo"), chart("c", "Charlie")]),
        draw("draw-2", 2, "S17", [chart("d", "Delta"), chart("e", "Echo"), chart("f", "Foxtrot")]),
      ],
      ballots: [ballot("p1", ["a"]), ballot("p2", ["a"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      now: "2026-06-28T00:00:00.000Z",
    });

    expect(result.sets[0].selectedChart.name).toBe("Bravo");

    const corrected = store.overrideSelectedChart({
      roundNumber: 1,
      setOrder: 1,
      chartId: "c",
      now: "2026-06-28T00:01:00.000Z",
    });

    expect(corrected.sets[0].selectedChart.name).toBe("Charlie");
    expect(corrected.sets[0].rows.find((row) => row.chart.id === "c")?.selected).toBe(true);
    expect(corrected.sets[0].rows.find((row) => row.chart.id === "b")?.selected).toBe(false);
  });
});
