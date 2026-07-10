import { describe, expect, it } from "vitest";
import {
  createPublicRouteFreshnessKey,
  shouldAcceptPublicRoutePayload,
  type PublicRouteFreshnessInput,
} from "./public-route-freshness";

const DRAW_ONE = {
  createdAt: "2026-07-08T00:00:01.000Z",
  drawId: "draw-1-a",
  roundSetId: "round-1-set-1",
  version: 1,
};

const DRAW_TWO = {
  createdAt: "2026-07-08T00:00:02.000Z",
  drawId: "draw-1-b",
  roundSetId: "round-1-set-2",
  version: 1,
};

const DRAW_ONE_REROLLED = {
  createdAt: "2026-07-08T00:00:40.000Z",
  drawId: "draw-1-a-reroll",
  roundSetId: "round-1-set-1",
  version: 2,
};

function freshness(overrides: Partial<PublicRouteFreshnessInput> = {}) {
  return createPublicRouteFreshnessKey({
    activeDrawVersions: [DRAW_ONE, DRAW_TWO],
    currentRound: 1,
    latestBallotRevisionAt: null,
    latestTournamentActionAt: "2026-07-08T00:00:03.000Z",
    latestTournamentActionSequence: 1,
    resultComputedAt: null,
    resultFinalRevealedAt: null,
    resultRevealPhase: null,
    resultRevealPhaseStartedAt: null,
    resultSnapshotId: null,
    route: "/stage",
    routeRoundNumber: 1,
    routeSource: "current_round",
    votingStatus: "voting_open",
    votingWindowClosedAt: null,
    votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
    votingWindowUpdatedAt: "2026-07-08T00:00:03.000Z",
    ...overrides,
  });
}

describe("public route freshness", () => {
  it("rejects older reveal-phase payloads for the same result snapshot", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultRevealPhase: "set_2_counts",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "result-1",
      votingStatus: "results_revealing",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    const stale = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultRevealPhase: "set_1_counts",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:20.000Z",
      resultSnapshotId: "result-1",
      votingStatus: "results_revealing",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(stale, accepted)).toBe(false);
  });

  it("accepts a newer same-phase correction snapshot", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "result-before-correction",
      votingStatus: "results_revealed",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const corrected = freshness({
      latestTournamentActionAt: "2026-07-08T00:01:05.000Z",
      resultComputedAt: "2026-07-08T00:01:00.000Z",
      resultFinalRevealedAt: "2026-07-08T00:01:05.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:01:05.000Z",
      resultSnapshotId: "result-after-correction",
      votingStatus: "results_revealed",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(corrected, accepted)).toBe(true);
  });

  it("accepts a newer reset payload even though it moves the UI back to not started", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "result-before-reset",
      votingStatus: "results_revealed",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const reset = freshness({
      activeDrawVersions: [],
      latestTournamentActionAt: "2026-07-08T00:02:00.000Z",
      resultComputedAt: null,
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    expect(shouldAcceptPublicRoutePayload(reset, accepted)).toBe(true);
  });

  it("rejects a stale reset-shaped payload without a newer tournament action", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "result-before-stale-refresh",
      votingStatus: "results_revealed",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const staleResetShape = freshness({
      activeDrawVersions: [],
      latestTournamentActionAt: "2026-07-08T00:00:05.000Z",
      resultComputedAt: null,
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    expect(shouldAcceptPublicRoutePayload(staleResetShape, accepted)).toBe(false);
  });

  it("uses tournament action sequence to accept same-millisecond reset payloads", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 5,
      resultComputedAt: "2026-07-08T00:00:10.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "result-before-same-ms-reset",
      votingStatus: "results_revealed",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const reset = freshness({
      activeDrawVersions: [],
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 6,
      resultComputedAt: null,
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    const staleReset = freshness({
      activeDrawVersions: [],
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 5,
      resultComputedAt: null,
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    expect(shouldAcceptPublicRoutePayload(reset, accepted)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(staleReset, accepted)).toBe(false);
  });

  it("accepts an emergency reopen with a newer voting-window transition", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: "2026-07-08T00:00:20.000Z",
      resultRevealPhase: "computed",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:20.000Z",
      resultSnapshotId: "computed-result",
      votingStatus: "results_computed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    const reopened = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "voting_open",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(reopened, accepted)).toBe(true);
  });

  it("accepts newer pause and resume voting-window transitions", () => {
    const open = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      votingStatus: "voting_open",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });
    const paused = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      votingStatus: "voting_paused",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });
    const resumed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      votingStatus: "voting_open",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(paused, open)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(resumed, paused)).toBe(true);
  });

  it("uses tournament action sequence to accept same-millisecond pause and resume transitions", () => {
    const open = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      latestTournamentActionSequence: 2,
      votingStatus: "voting_open",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });
    const paused = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      latestTournamentActionSequence: 3,
      votingStatus: "voting_paused",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });
    const resumed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      latestTournamentActionSequence: 4,
      votingStatus: "voting_open",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(paused, open)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(resumed, paused)).toBe(true);
  });

  it("accepts newer pause from final-warning and extension states", () => {
    const finalWarning = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      votingStatus: "final_30_seconds",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });
    const pausedFromFinalWarning = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      votingStatus: "voting_paused",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });
    const extension = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      votingStatus: "extension_1_minute",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });
    const pausedFromExtension = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:40.000Z",
      votingStatus: "voting_paused",
      votingWindowUpdatedAt: "2026-07-08T00:00:40.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(pausedFromFinalWarning, finalWarning)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(pausedFromExtension, extension)).toBe(true);
  });

  it("accepts newer final-warning rollback after eligibility changes", () => {
    const finalWarning = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:10.000Z",
      votingStatus: "final_30_seconds",
      votingWindowUpdatedAt: "2026-07-08T00:00:10.000Z",
    });
    const returnedToOpen = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      votingStatus: "voting_open",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(returnedToOpen, finalWarning)).toBe(true);
  });

  it("accepts newer computed-result invalidation back to closed voting", () => {
    const computed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: "2026-07-08T00:00:20.000Z",
      resultRevealPhase: "computed",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:20.000Z",
      resultSnapshotId: "computed-before-manual-ballot",
      votingStatus: "results_computed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    const invalidated = freshness({
      latestBallotRevisionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "voting_closed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(invalidated, computed)).toBe(true);
  });

  it("accepts newer computed-result invalidation from a post-compute reroll", () => {
    const computed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: "2026-07-08T00:00:20.000Z",
      resultRevealPhase: "computed",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:20.000Z",
      resultSnapshotId: "computed-before-reroll",
      votingStatus: "results_computed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    const rerolled = freshness({
      activeDrawVersions: [DRAW_ONE_REROLLED, DRAW_TWO],
      latestTournamentActionAt: "2026-07-08T00:00:40.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "ready_to_vote",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    expect(shouldAcceptPublicRoutePayload(rerolled, computed)).toBe(true);
  });

  it("rejects stale computed-result reroll-shaped payloads without newer draw progress", () => {
    const computed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "computed",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "computed-result",
      votingStatus: "results_computed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const staleRerollShape = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "ready_to_vote",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });

    expect(shouldAcceptPublicRoutePayload(staleRerollShape, computed)).toBe(false);
  });

  it("rejects stale result invalidation-shaped payloads without a newer voting transition", () => {
    const computed = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultComputedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "computed",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "computed-result",
      votingStatus: "results_computed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    const staleInvalidationShape = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:20.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "voting_closed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(staleInvalidationShape, computed)).toBe(false);
  });

  it("rejects newer non-result payloads once an active stage reveal has started", () => {
    const activeReveal = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:40.000Z",
      resultComputedAt: "2026-07-08T00:00:20.000Z",
      resultRevealPhase: "set_1_resolved",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:40.000Z",
      resultSnapshotId: "active-reveal",
      votingStatus: "results_revealing",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    const drawFallbackPayload = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:50.000Z",
      resultComputedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      votingStatus: "voting_closed",
      votingWindowClosedAt: "2026-07-08T00:00:10.000Z",
      votingWindowOpenedAt: "2026-07-08T00:00:03.000Z",
      votingWindowUpdatedAt: "2026-07-08T00:00:20.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(drawFallbackPayload, activeReveal)).toBe(false);
  });

  it("accepts round advance and rejects a later-arriving older-round payload", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "round-1-final",
      votingStatus: "round_complete",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });
    const roundTwo = freshness({
      activeDrawVersions: [],
      currentRound: 2,
      latestTournamentActionAt: "2026-07-08T00:01:00.000Z",
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      routeRoundNumber: 2,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });
    const staleRoundOne = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "round-1-final",
      votingStatus: "round_complete",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(roundTwo, accepted)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(staleRoundOne, roundTwo)).toBe(false);
  });

  it("uses tournament action sequence to accept same-millisecond round advance payloads", () => {
    const accepted = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 8,
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "round-1-final",
      votingStatus: "round_complete",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });
    const roundTwo = freshness({
      activeDrawVersions: [],
      currentRound: 2,
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 9,
      resultFinalRevealedAt: null,
      resultRevealPhase: null,
      resultRevealPhaseStartedAt: null,
      resultSnapshotId: null,
      routeRoundNumber: 2,
      votingStatus: "not_started",
      votingWindowClosedAt: null,
      votingWindowOpenedAt: null,
      votingWindowUpdatedAt: null,
    });
    const staleRoundOne = freshness({
      latestTournamentActionAt: "2026-07-08T00:00:30.000Z",
      latestTournamentActionSequence: 8,
      resultFinalRevealedAt: "2026-07-08T00:00:30.000Z",
      resultRevealPhase: "final",
      resultRevealPhaseStartedAt: "2026-07-08T00:00:30.000Z",
      resultSnapshotId: "round-1-final",
      votingStatus: "round_complete",
      votingWindowUpdatedAt: "2026-07-08T00:00:30.000Z",
    });

    expect(shouldAcceptPublicRoutePayload(roundTwo, accepted)).toBe(true);
    expect(shouldAcceptPublicRoutePayload(staleRoundOne, roundTwo)).toBe(false);
  });
});
