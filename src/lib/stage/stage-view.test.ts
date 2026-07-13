import { describe, expect, it } from "vitest";
import type { DrawRecord } from "@/lib/draw/draw-state";
import {
  buildStageRevealClockKey,
  buildStageRoundView,
  getStageVisibleCardCount,
  STAGE_CHART_REVEAL_INTERVAL_MS,
  STAGE_SET_REVEAL_GAP_MS,
  stageShouldShowAllDrawCards,
  stageShouldUseResultMode,
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

  it.each(["voting_open", "voting_paused", "final_30_seconds", "extension_1_minute"] as const)(
    "shows every drawn chart immediately during %s",
    (status) => {
      expect(stageShouldShowAllDrawCards(status)).toBe(true);
    },
  );

  it.each([
    "not_started",
    "drawing",
    "ready_to_vote",
    "voting_closed",
    "results_computed",
    "results_revealing",
    "results_revealed",
    "round_complete",
  ] as const)("does not override canonical or result rendering during %s", (status) => {
    expect(stageShouldShowAllDrawCards(status)).toBe(false);
  });

  it("reconstructs pre-vote card progress from the canonical timestamp", () => {
    const revealStartsAt = "2026-06-28T00:00:00.000Z";
    const revealStartsAtMs = Date.parse(revealStartsAt);

    expect(getStageVisibleCardCount(7, revealStartsAt, revealStartsAtMs - 1)).toBe(0);
    expect(getStageVisibleCardCount(7, revealStartsAt, revealStartsAtMs)).toBe(1);
    expect(
      getStageVisibleCardCount(
        7,
        revealStartsAt,
        revealStartsAtMs + 3 * STAGE_CHART_REVEAL_INTERVAL_MS,
      ),
    ).toBe(4);
    expect(
      getStageVisibleCardCount(
        7,
        revealStartsAt,
        revealStartsAtMs + 20 * STAGE_CHART_REVEAL_INTERVAL_MS,
      ),
    ).toBe(7);
  });

  it("treats immediate visibility as complete and invalid canonical timing as blocked", () => {
    expect(getStageVisibleCardCount(7, undefined, Number.NaN)).toBe(7);
    expect(getStageVisibleCardCount(7, null, Date.now())).toBe(0);
    expect(getStageVisibleCardCount(7, "invalid", Date.now())).toBe(0);
  });

  it("keeps the reveal clock key stable across same-revision server samples", () => {
    const view = buildStageRoundView(
      {
        getActiveDraw: (_roundNumber, setOrder) =>
          draw(setOrder, `2026-06-28T00:00:0${setOrder}.000Z`),
      },
      1,
    );
    const clonedSets = view.sets.map((setView) => ({
      ...setView,
      draw: setView.draw ? { ...setView.draw } : null,
    }));

    expect(buildStageRevealClockKey(view.sets, "ready_to_vote", 7)).toBe(
      buildStageRevealClockKey(clonedSets, "ready_to_vote", 7),
    );
    expect(buildStageRevealClockKey(view.sets, "ready_to_vote", 8)).not.toBe(
      buildStageRevealClockKey(view.sets, "ready_to_vote", 7),
    );
  });

  it("changes the reveal clock key for a new draw version", () => {
    const view = buildStageRoundView(
      {
        getActiveDraw: (_roundNumber, setOrder) =>
          draw(setOrder, `2026-06-28T00:00:0${setOrder}.000Z`),
      },
      1,
    );
    const replacementSets = view.sets.map((setView) =>
      setView.set.setOrder === 1 && setView.draw
        ? { ...setView, draw: { ...setView.draw, version: setView.draw.version + 1 } }
        : setView,
    );

    expect(buildStageRevealClockKey(replacementSets, "ready_to_vote", 7)).not.toBe(
      buildStageRevealClockKey(view.sets, "ready_to_vote", 7),
    );
  });

  it("keeps stage in result mode once result statuses begin", () => {
    expect(stageShouldUseResultMode("ready_to_vote", false)).toBe(false);
    expect(stageShouldUseResultMode("voting_closed", false)).toBe(true);
    expect(stageShouldUseResultMode("results_computed", false)).toBe(true);
    expect(stageShouldUseResultMode("results_revealing", false)).toBe(true);
    expect(stageShouldUseResultMode("results_revealed", false)).toBe(true);
    expect(stageShouldUseResultMode("round_complete", false)).toBe(true);
    expect(stageShouldUseResultMode("voting_closed", true)).toBe(true);
  });
});
