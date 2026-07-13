import { describe, expect, it } from "vitest";
import {
  createPublicRouteFreshnessKey,
  type PublicRouteFreshnessInput,
} from "@/lib/round/public-route-freshness";
import {
  explicitNewGenerationAllowsDrawMode,
  resultModeHasStarted,
  shouldHoldInsteadOfDraw,
} from "./StageResultPhaseGuard";

function freshness(overrides: Partial<PublicRouteFreshnessInput> = {}) {
  return createPublicRouteFreshnessKey({
    activeDrawVersions: [
      {
        createdAt: "2026-07-13T00:00:01.000Z",
        drawId: "draw-1",
        roundSetId: "round-1-set-1",
        version: 1,
      },
      {
        createdAt: "2026-07-13T00:00:02.000Z",
        drawId: "draw-2",
        roundSetId: "round-1-set-2",
        version: 1,
      },
    ],
    currentRound: 1,
    latestBallotRevisionAt: null,
    latestTournamentActionAt: "2026-07-13T00:00:03.000Z",
    latestTournamentActionSequence: 1,
    publicStateGeneration: 7,
    publicStateResultMode: false,
    publicStateTransitionKind: "result_reveal_advanced",
    resultComputedAt: null,
    resultFinalRevealedAt: null,
    resultRevealPhase: null,
    resultRevealPhaseStartedAt: null,
    resultSnapshotId: null,
    route: "/stage",
    routeRoundNumber: 1,
    routeSource: "current_round",
    votingStatus: "results_revealing",
    votingWindowClosedAt: "2026-07-13T00:00:03.000Z",
    votingWindowOpenedAt: "2026-07-13T00:00:01.000Z",
    votingWindowUpdatedAt: "2026-07-13T00:00:03.000Z",
    ...overrides,
  });
}

describe("stage result-mode holding", () => {
  it("keeps a sticky result lock through an incomplete reveal detail read", () => {
    const incompleteReveal = freshness();

    expect(resultModeHasStarted(incompleteReveal)).toBe(false);
    expect(explicitNewGenerationAllowsDrawMode(incompleteReveal)).toBe(false);
    expect(shouldHoldInsteadOfDraw(incompleteReveal, true)).toBe(true);
  });

  it("treats the authoritative projection flag as result mode before details arrive", () => {
    expect(resultModeHasStarted(freshness({ publicStateResultMode: true }))).toBe(true);
  });

  it("unlocks draw mode only for an explicit reset, reroll, restart, or round change", () => {
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "reroll_one_chart" }),
      ),
    ).toBe(true);
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "voting_restarted" }),
      ),
    ).toBe(true);
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "voting_opened" }),
      ),
    ).toBe(true);
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "reset_tournament_data" }),
      ),
    ).toBe(true);
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "start_rehearsal_mode" }),
      ),
    ).toBe(true);
    expect(
      explicitNewGenerationAllowsDrawMode(
        freshness({ publicStateTransitionKind: "results_released" }),
      ),
    ).toBe(false);
  });
});
