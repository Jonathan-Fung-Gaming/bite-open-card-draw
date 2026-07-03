import { describe, expect, it } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { assertRoundDrawsReady, evaluateRoundDrawReadiness } from "./round-readiness";

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

function draw(
  id: string,
  setOrder: 1 | 2,
  chartCount = 7,
  roundNumber: 1 | 2 | 3 | 4 = 1,
): DrawRecord {
  return {
    id,
    roundSetId: `round-set-${setOrder}`,
    roundNumber,
    setOrder,
    displayLabel: setOrder === 1 ? "S16" : "S17",
    version: 1,
    eligiblePoolCount: chartCount,
    charts: Array.from({ length: chartCount }, (_, index) => chart(`${id}-${index}`)),
    createdAt: "now",
    supersededAt: null,
    reason: "test",
  };
}

describe("round draw readiness", () => {
  it("requires both round sets to have exactly seven charts", () => {
    expect(evaluateRoundDrawReadiness(1, [draw("set-1", 1), draw("set-2", 2)])).toMatchObject({
      isReady: true,
      completeSetCount: 2,
      problems: [],
    });

    expect(evaluateRoundDrawReadiness(1, [draw("set-1", 1, 6), draw("set-2", 2)])).toMatchObject(
      {
        isReady: false,
        completeSetCount: 1,
        problems: [{ setOrder: 1, actualChartCount: 6, reason: "wrong_chart_count" }],
      },
    );
  });

  it("rejects missing and duplicate set orders", () => {
    expect(evaluateRoundDrawReadiness(1, [draw("set-1", 1)])).toMatchObject({
      isReady: false,
      problems: [{ setOrder: 2, reason: "missing" }],
    });

    expect(
      evaluateRoundDrawReadiness(1, [draw("set-1a", 1), draw("set-1b", 1), draw("set-2", 2)]),
    ).toMatchObject({
      isReady: false,
      problems: [{ setOrder: 1, reason: "duplicate" }],
    });

    expect(() => assertRoundDrawsReady(1, [draw("set-1", 1, 6), draw("set-2", 2)])).toThrow(
      /exactly 7 charts/,
    );
  });

  it("rejects complete future draws containing prior selected songs", () => {
    const stale = draw("set-1", 1, 7, 2);
    const current = draw("set-2", 2, 7, 2);
    stale.charts[0] = {
      ...chart("shared"),
      name: "Shared Winner",
      songKey: "song-shared",
    };

    const readiness = evaluateRoundDrawReadiness(2, [stale, current], {
      priorSelectedSongBlocks: [
        {
          songKey: "song-shared",
          selectedInRoundNumber: 1,
          chartId: "round-1-shared",
          chartName: "Shared Winner",
        },
      ],
    });

    expect(readiness).toMatchObject({
      isReady: false,
      completeSetCount: 2,
      problems: [
        {
          setOrder: 1,
          displayLabel: "S18",
          reason: "prior_selected_song",
          chartName: "Shared Winner",
          selectedInRoundNumber: 1,
        },
      ],
    });
    expect(() =>
      assertRoundDrawsReady(2, [stale, current], {
        priorSelectedSongBlocks: [
          {
            songKey: "song-shared",
            selectedInRoundNumber: 1,
            chartId: "round-1-shared",
            chartName: "Shared Winner",
          },
        ],
      }),
    ).toThrow(/selected in Round 1/);
  });
});
