import { describe, expect, it } from "vitest";
import {
  PUBLIC_ROUTE_STATE_MATRIX,
  RoundStateStore,
  resolvePublicRouteState,
} from "./round-state";

describe("round state store", () => {
  it("tracks current round and rehearsal mode", () => {
    const store = new RoundStateStore();

    expect(store.getSnapshot()).toEqual({ currentRound: 1, rehearsalMode: false });

    store.setRehearsalMode(true);
    store.setCurrentRound(3);

    expect(store.getSnapshot()).toEqual({ currentRound: 3, rehearsalMode: true });
  });

  it("advances rounds without passing Round 4", () => {
    const store = new RoundStateStore();

    store.advanceRound();
    expect(store.getSnapshot().currentRound).toBe(2);

    store.setCurrentRound(4);
    expect(() => store.advanceRound()).toThrow("Round 4 is the final round.");
  });

  it("blocks active current-round changes unless the round is safe to move", () => {
    const store = new RoundStateStore();

    expect(() =>
      store.setCurrentRound(2, { currentRoundStatus: "voting_open" }),
    ).toThrow(/Current round changes are blocked/);

    expect(store.getSnapshot().currentRound).toBe(1);

    store.setCurrentRound(2, { currentRoundStatus: "results_revealed" });

    expect(store.getSnapshot().currentRound).toBe(2);
  });

  it("blocks advancing while results are computed but not revealed", () => {
    const store = new RoundStateStore();

    expect(() => store.advanceRound({ currentRoundStatus: "results_computed" })).toThrow(
      /Complete or reset the round/,
    );

    store.advanceRound({ currentRoundStatus: "round_complete" });

    expect(store.getSnapshot().currentRound).toBe(2);
  });

  it("defines route-state behavior for live routes and previous final results", () => {
    expect(PUBLIC_ROUTE_STATE_MATRIX).toEqual({
      "/stage": "current_round",
      "/vote": "current_round",
      "/charts": "current_round",
      "/results": "current_round_or_previous_final_result",
    });

    const rounds = [
      { roundNumber: 1 as const, status: "results_revealed" as const, hasFinalResult: true },
      { roundNumber: 2 as const, status: "not_started" as const },
    ];

    expect(
      resolvePublicRouteState({ route: "/stage", currentRound: 2, rounds }),
    ).toMatchObject({
      roundNumber: 2,
      source: "current_round",
      showPreviousRoundResult: false,
    });
    expect(
      resolvePublicRouteState({ route: "/vote", currentRound: 2, rounds }),
    ).toMatchObject({
      roundNumber: 2,
      source: "current_round",
    });
    expect(
      resolvePublicRouteState({ route: "/charts", currentRound: 2, rounds }),
    ).toMatchObject({
      roundNumber: 2,
      source: "current_round",
    });
    expect(
      resolvePublicRouteState({ route: "/results", currentRound: 2, rounds }),
    ).toMatchObject({
      roundNumber: 1,
      source: "previous_round_result",
      showPreviousRoundResult: true,
    });
  });

  it("pins results to the current round once current-round voting or reveal starts", () => {
    const rounds = [
      { roundNumber: 1 as const, status: "results_revealed" as const, hasFinalResult: true },
      { roundNumber: 2 as const, status: "voting_open" as const },
    ];

    expect(
      resolvePublicRouteState({ route: "/results", currentRound: 2, rounds }),
    ).toMatchObject({
      roundNumber: 2,
      source: "current_round",
      showPreviousRoundResult: false,
    });
  });

  it("lets the results route keep showing the latest previous final result after advancing", () => {
    const rounds = [
      { roundNumber: 1 as const, status: "results_revealed" as const, hasFinalResult: true },
      { roundNumber: 2 as const, status: "not_started" as const, hasFinalResult: false },
      { roundNumber: 3 as const, status: "not_started" as const, hasFinalResult: false },
    ];

    expect(
      resolvePublicRouteState({ route: "/results", currentRound: 3, rounds }),
    ).toMatchObject({
      roundNumber: 1,
      source: "previous_round_result",
      showPreviousRoundResult: true,
    });
  });
});
