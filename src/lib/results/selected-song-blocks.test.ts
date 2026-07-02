import { describe, expect, it } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { ResultStore } from "@/lib/results/result-store";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import type { DrawStateStore } from "@/lib/draw/draw-state";
import {
  assertNoFutureSelectedSongConflicts,
  findFutureSelectedSongConflicts,
  selectedSongKeysFromResults,
} from "./selected-song-blocks";

function chart(id: string, name: string, songKey: string): DrawnChartSummary {
  return {
    id,
    name,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey,
    chartKey: `chart-${id}`,
    sourceBgImg: "",
    localImagePath: "/chart-images/fallback-card.svg",
  };
}

function draw(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2, charts: DrawnChartSummary[]): DrawRecord {
  return {
    id: `draw-${roundNumber}-${setOrder}`,
    roundSetId: `set-${roundNumber}-${setOrder}`,
    roundNumber,
    setOrder,
    displayLabel: `Set ${setOrder}`,
    version: 1,
    eligiblePoolCount: charts.length,
    charts,
    createdAt: "drawn",
    supersededAt: null,
    reason: "test",
  };
}

function result(roundNumber: 1 | 2 | 3 | 4, charts: DrawnChartSummary[]): RoundResultSnapshot {
  const rows = charts.map((candidate, index) => ({
    chart: candidate,
    banCount: index,
    selected: index === 0,
    tiedForFewest: index === 0,
  }));

  return {
    id: `result-${roundNumber}`,
    roundNumber,
    computedAt: "computed",
    eligiblePlayers: [],
    sets: [
      {
        drawId: `draw-${roundNumber}-1`,
        drawVersion: 1,
        roundSetId: `set-${roundNumber}-1`,
        setOrder: 1,
        displayLabel: "Set 1",
        rows,
        maxBanCount: rows.length - 1,
        leastBanCount: 0,
        selectedChart: charts[0] as DrawnChartSummary,
        tiebreakUsed: false,
        tiebreakCandidateIds: [charts[0]?.id ?? ""],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
      {
        drawId: `draw-${roundNumber}-2`,
        drawVersion: 1,
        roundSetId: `set-${roundNumber}-2`,
        setOrder: 2,
        displayLabel: "Set 2",
        rows: [],
        maxBanCount: 0,
        leastBanCount: 0,
        selectedChart: charts[0] as DrawnChartSummary,
        tiebreakUsed: false,
        tiebreakCandidateIds: [],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
    ],
    revealPhase: "computed",
    revealPhaseStartedAt: "computed",
    finalRevealedAt: null,
  };
}

function fakeDrawStore(drawsByRound: Partial<Record<1 | 2 | 3 | 4, Array<DrawRecord | null>>>) {
  return {
    getRoundDraws(roundNumber: 1 | 2 | 3 | 4) {
      return drawsByRound[roundNumber] ?? [];
    },
  } as unknown as DrawStateStore;
}

function fakeResultStore(resultsByRound: Partial<Record<1 | 2 | 3 | 4, RoundResultSnapshot>>) {
  return {
    getRoundResult(roundNumber: 1 | 2 | 3 | 4) {
      return resultsByRound[roundNumber] ?? null;
    },
    exportSnapshot() {
      return { results: Object.values(resultsByRound) };
    },
  } as unknown as ResultStore;
}

describe("selected song blocks", () => {
  it("dedupes selected song keys from result snapshots", () => {
    const shared = chart("shared", "Shared", "song-shared");

    expect(selectedSongKeysFromResults([result(1, [shared]), result(2, [shared])])).toEqual([
      "song-shared",
    ]);
  });

  it("finds future active-draw and result conflicts for an earlier override candidate", () => {
    const shared = chart("shared", "Shared Future Song", "song-shared");
    const drawStore = fakeDrawStore({
      2: [draw(2, 1, [shared])],
    });
    const resultStore = fakeResultStore({
      3: result(3, [shared]),
    });

    expect(
      findFutureSelectedSongConflicts({
        roundNumber: 1,
        candidateSongKey: "song-shared",
        existingSelectedSongKey: "song-old",
        drawStateStore: drawStore,
        resultStore,
      }),
    ).toEqual([
      {
        roundNumber: 2,
        setOrder: 1,
        source: "active_draw",
        chartId: "shared",
        chartName: "Shared Future Song",
      },
      {
        roundNumber: 3,
        setOrder: 1,
        source: "result",
        chartId: "shared",
        chartName: "Shared Future Song",
      },
    ]);
  });

  it("allows no-op overrides to the already selected song", () => {
    const shared = chart("shared", "Shared Future Song", "song-shared");

    expect(
      findFutureSelectedSongConflicts({
        roundNumber: 1,
        candidateSongKey: "song-shared",
        existingSelectedSongKey: "song-shared",
        drawStateStore: fakeDrawStore({ 2: [draw(2, 1, [shared])] }),
        resultStore: fakeResultStore({}),
      }),
    ).toEqual([]);
  });

  it("blocks overrides that would invalidate future selected-song constraints", () => {
    const shared = chart("shared", "Shared Future Song", "song-shared");

    expect(() =>
      assertNoFutureSelectedSongConflicts({
        roundNumber: 1,
        candidateSongKey: "song-shared",
        existingSelectedSongKey: "song-old",
        drawStateStore: fakeDrawStore({ 2: [draw(2, 1, [shared])] }),
        resultStore: fakeResultStore({}),
      }),
    ).toThrow(/Reset or invalidate affected future rounds/);
  });
});
