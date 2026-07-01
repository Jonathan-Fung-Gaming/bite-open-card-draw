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

function draw(id: string, setOrder: 1 | 2, chartCount = 7): DrawRecord {
  return {
    id,
    roundSetId: `round-set-${setOrder}`,
    roundNumber: 1,
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
});
