import { describe, expect, it } from "vitest";
import type { DrawRecord } from "@/lib/draw/draw-state";
import {
  buildStageRoundView,
  STAGE_CHART_REVEAL_INTERVAL_MS,
  STAGE_SET_REVEAL_GAP_MS,
} from "./stage-view";

function draw(setOrder: 1 | 2, createdAt: string): DrawRecord {
  return {
    id: `draw-${setOrder}`,
    roundSetId: `static-set-${setOrder}`,
    roundNumber: 1,
    setOrder,
    displayLabel: setOrder === 1 ? "S16" : "S17",
    version: 1,
    eligiblePoolCount: 20,
    charts: Array.from({ length: 7 }, (_, index) => ({
      id: `${setOrder}-${index}`,
      name: `Chart ${setOrder}-${index}`,
      artist: "Artist",
      displayDifficulty: setOrder === 1 ? "S16" : "S17",
      songKey: `song-${setOrder}-${index}`,
      chartKey: `chart-${setOrder}-${index}`,
      sourceBgImg: "",
      localImagePath: "/chart-images/fallback-card.svg",
    })),
    createdAt,
    supersededAt: null,
    reason: "test",
  };
}

describe("stage round view", () => {
  it("reports readiness only when both round sets are drawn", () => {
    const view = buildStageRoundView(
      {
        getActiveDraw: (_roundNumber, setOrder) =>
          setOrder === 1 ? draw(1, "2026-06-28T00:00:00.000Z") : null,
      },
      1,
    );

    expect(view.sets).toHaveLength(2);
    expect(view.bothSetsDrawn).toBe(false);
  });

  it("schedules the stage reveal as all Set 1 charts before Set 2", () => {
    const setOneCreatedAt = "2026-06-28T00:00:00.000Z";
    const setTwoCreatedAt = "2026-06-28T00:00:01.000Z";
    const view = buildStageRoundView(
      {
        getActiveDraw: (_roundNumber, setOrder) =>
          draw(setOrder, setOrder === 1 ? setOneCreatedAt : setTwoCreatedAt),
      },
      1,
    );

    expect(view.sets[0]?.revealStartsAt).toBe(setOneCreatedAt);
    expect(Date.parse(view.sets[1]?.revealStartsAt ?? "")).toBe(
      Date.parse(setOneCreatedAt) + 7 * STAGE_CHART_REVEAL_INTERVAL_MS + STAGE_SET_REVEAL_GAP_MS,
    );
  });
});
