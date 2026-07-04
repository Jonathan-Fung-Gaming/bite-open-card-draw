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

function draw(
  id: string,
  setOrder: 1 | 2,
  displayLabel: string,
  charts: DrawnChartSummary[],
): DrawRecord {
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

describe("result store reveal timing", () => {
  it("keeps a backend-decided tiebreak winner sealed for five seconds", () => {
    const store = new ResultStore(() => 1);
    const computedAt = "2026-06-28T00:00:00.000Z";
    const setOneResolvedAt = "2026-06-28T00:00:02.000Z";

    const result = store.computeRound({
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
      eligiblePlayers: [
        { id: "p1", startggUsername: "p1" },
        { id: "p2", startggUsername: "p2" },
        { id: "p3", startggUsername: "p3" },
      ],
      priorSelectedSongBlocks: [],
      now: computedAt,
    });

    expect(result.sets[0].selectedChart.name).toBe("Bravo");
    expect(result.sets[0].winnerRevealStartedAt).toBeNull();

    store.advanceReveal(1, "2026-06-28T00:00:01.000Z");
    const resolved = store.advanceReveal(1, setOneResolvedAt);

    expect(resolved.revealPhase).toBe("set_1_resolved");
    expect(resolved.sets[0].winnerRevealStartedAt).toBe(setOneResolvedAt);
    expect(() => store.advanceReveal(1, "2026-06-28T00:00:04.000Z")).toThrow(/tiebreak reveal/);

    const afterReveal = new Date(
      Date.parse(setOneResolvedAt) + TIEBREAK_REVEAL_DURATION_MS,
    ).toISOString();

    expect(store.advanceReveal(1, afterReveal).revealPhase).toBe("set_2_counts");
  });

  it("keeps a second-set tiebreak sealed before the final two-chart reveal", () => {
    const store = new ResultStore(() => 2);
    const computedAt = "2026-06-28T00:00:00.000Z";
    const setOneResolvedAt = "2026-06-28T00:00:02.000Z";
    const setTwoResolvedAt = "2026-06-28T00:00:04.000Z";

    store.computeRound({
      roundNumber: 1,
      draws: [
        draw("draw-1", 1, "S16", sevenCharts("set-one")),
        draw("draw-2", 2, "S17", sevenCharts("set-two")),
      ],
      ballots: [
        ballot("p1", ["set-one-1", "set-one-2"]),
        ballot("p2", ["set-one-3", "set-one-4"]),
        ballot("p3", ["set-one-5", "set-one-6"]),
      ],
      eligiblePlayers: [
        { id: "p1", startggUsername: "p1" },
        { id: "p2", startggUsername: "p2" },
        { id: "p3", startggUsername: "p3" },
      ],
      priorSelectedSongBlocks: [],
      now: computedAt,
    });

    store.advanceReveal(1, "2026-06-28T00:00:01.000Z");
    store.advanceReveal(1, setOneResolvedAt);
    store.advanceReveal(1, "2026-06-28T00:00:03.000Z");
    const setTwoResolved = store.advanceReveal(1, setTwoResolvedAt);

    expect(setTwoResolved.revealPhase).toBe("set_2_resolved");
    expect(setTwoResolved.sets[1].tiebreakUsed).toBe(true);
    expect(setTwoResolved.sets[1].winnerRevealStartedAt).toBe(setTwoResolvedAt);
    expect(() => store.advanceReveal(1, "2026-06-28T00:00:06.000Z")).toThrow(/tiebreak reveal/);

    const afterReveal = new Date(
      Date.parse(setTwoResolvedAt) + TIEBREAK_REVEAL_DURATION_MS,
    ).toISOString();

    expect(store.advanceReveal(1, afterReveal).revealPhase).toBe("final");
  });

  it("overrides a selected chart as an emergency correction", () => {
    const store = new ResultStore(() => 0);

    const result = store.computeRound({
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
      ballots: [ballot("p1", ["a", "d"]), ballot("p2", ["a", "e"]), ballot("p3", ["f", "g"])],
      eligiblePlayers: [{ id: "p1", startggUsername: "p1" }],
      priorSelectedSongBlocks: [],
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
