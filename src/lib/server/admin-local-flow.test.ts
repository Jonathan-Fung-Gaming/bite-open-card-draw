import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { createAdminStateStores } from "@/lib/persistence/operational-state";
import type { SubmitRoundBallotInput } from "@/lib/vote/ballot";
import { ONE_MINUTE_MS } from "@/lib/vote/voting-window";

const eligiblePlayers = [
  { id: "player-1", startggUsername: "Alpha" },
  { id: "player-2", startggUsername: "Bravo" },
] as const;

function draw(id: string, setOrder: 1 | 2, displayLabel: "S16" | "S17"): DrawRecord {
  const level = displayLabel === "S16" ? "16" : "17";
  const charts = Array.from({ length: 7 }, (_, index) =>
    normalizeChartRow(
      {
        name: `${displayLabel} Song ${index + 1}`,
        name_kr: `${displayLabel} Song ${index + 1}`,
        artist: `Artist ${index + 1}`,
        label: "test",
        type: "s",
        level,
        bg_img: "",
      },
      setOrder * 100 + index,
    ),
  );

  return {
    id,
    roundSetId: `static-${displayLabel.toLowerCase()}`,
    roundNumber: 1,
    setOrder,
    displayLabel,
    version: 1,
    eligiblePoolCount: 20,
    charts,
    createdAt: "drawn",
    supersededAt: null,
    reason: "test draw",
  };
}

function ballotInput(
  player: (typeof eligiblePlayers)[number],
  draws: DrawRecord[],
): SubmitRoundBallotInput {
  return {
    roundNumber: 1,
    playerId: player.id,
    playerStartggUsername: player.startggUsername,
    choices: draws.map((candidate) => ({
      drawId: candidate.id,
      roundSetId: candidate.roundSetId,
      displayLabel: candidate.displayLabel,
      noBans: false,
      bannedChartIds: [candidate.charts[0]?.id ?? ""],
    })),
  };
}

function setupComputedRound() {
  const stores = createAdminStateStores();
  const draws = [draw("draw-1", 1, "S16"), draw("draw-2", 2, "S17")];

  stores.votingWindowStore.openVoting({
    roundNumber: 1,
    drawsReady: true,
    eligiblePlayers: [...eligiblePlayers],
    nowMs: 0,
  });
  stores.ballotStore.submit(ballotInput(eligiblePlayers[0], draws), draws, "submitted");
  stores.votingWindowStore.closeVoting(1, 1_000);

  const result = stores.resultStore.computeRound({
    roundNumber: 1,
    draws,
    ballots: stores.ballotStore.listForRound(1),
    eligiblePlayers: [...eligiblePlayers],
    priorSelectedSongBlocks: [],
    now: "computed",
  });

  stores.votingWindowStore.setResultsPhase(1, "results_computed");
  stores.ballotStore.setPhoneStatus(1, { phase: "closed_revealing" });

  return { stores, draws, result };
}

function votingSnapshot(stores: ReturnType<typeof createAdminStateStores>, nowMs: number) {
  return stores.votingWindowStore.getSnapshot({
    roundNumber: 1,
    drawnSetCount: 2,
    eligiblePlayers: [...eligiblePlayers],
    submittedPlayerIds: stores.ballotStore.listForRound(1).map((ballot) => ballot.playerId),
    nowMs,
  });
}

describe("admin local flow evidence", () => {
  it("does not clear computed results when a post-compute manual ballot fails validation", () => {
    const { stores, draws, result } = setupComputedRound();
    const invalidManualBallot = ballotInput(eligiblePlayers[1], draws);

    invalidManualBallot.choices[0] = {
      ...invalidManualBallot.choices[0]!,
      bannedChartIds: ["not-a-drawn-chart"],
    };

    expect(() =>
      stores.ballotStore.submit(invalidManualBallot, draws, "failed-manual", {
        source: "manual_admin",
        manualReason: "paper backup",
        manualOverride: true,
      }),
    ).toThrow(/outside the drawn set/);

    expect(stores.resultStore.getRoundResult(1)).toBe(result);
    expect(votingSnapshot(stores, 2_000)).toMatchObject({
      status: "results_computed",
      canSubmit: false,
      canAcceptManualBallot: true,
      postCloseManualBallotsAreOverrides: true,
    });
    expect(stores.ballotStore.listForRound(1)).toHaveLength(1);
    expect(stores.ballotStore.get(1, "player-1")?.submittedAt).toBe("submitted");
  });

  it("clears an unrevealed computed result before recomputing after a valid manual override", () => {
    const { stores, draws } = setupComputedRound();
    const beforeManual = votingSnapshot(stores, 2_000);

    expect(beforeManual.status).toBe("results_computed");
    expect(beforeManual.postCloseManualBallotsAreOverrides).toBe(true);

    const manual = stores.ballotStore.submit(
      ballotInput(eligiblePlayers[1], draws),
      draws,
      beforeManual.serverNow,
      {
        source: "manual_admin",
        manualReason: "phone died",
        manualOverride: beforeManual.postCloseManualBallotsAreOverrides,
      },
    );

    stores.resultStore.clearRoundResult(1);
    stores.votingWindowStore.returnToClosedForRecompute(1, 2_000);

    const afterManual = votingSnapshot(stores, 2_000);

    expect(manual.manualOverride).toBe(true);
    expect(stores.resultStore.getRoundResult(1)).toBeNull();
    expect(afterManual).toMatchObject({
      status: "voting_closed",
      canSubmit: false,
      canAcceptManualBallot: true,
      postCloseManualBallotsAreOverrides: true,
      closedAt: new Date(1_000).toISOString(),
    });

    const recomputed = stores.resultStore.computeRound({
      roundNumber: 1,
      draws,
      ballots: stores.ballotStore.listForRound(1),
      eligiblePlayers: [...eligiblePlayers],
      priorSelectedSongBlocks: [],
      now: "recomputed",
    });

    expect(recomputed.computedAt).toBe("recomputed");
    expect(stores.ballotStore.listForRound(1)).toHaveLength(2);
  });

  it("clears an unrevealed computed result before emergency reopening local voting", () => {
    const { stores } = setupComputedRound();

    stores.resultStore.clearRoundResult(1);
    stores.votingWindowStore.returnToClosedForRecompute(1, 2_000);
    stores.votingWindowStore.reopenVoting({
      roundNumber: 1,
      durationMinutes: 5,
      nowMs: 2_000,
    });
    stores.ballotStore.setPhoneStatus(1, { phase: "voting_open" });

    expect(stores.resultStore.getRoundResult(1)).toBeNull();
    expect(stores.ballotStore.getPhoneStatus(1).phase).toBe("voting_open");
    expect(votingSnapshot(stores, 2_000)).toMatchObject({
      status: "voting_open",
      remainingMs: 5 * ONE_MINUTE_MS,
      extensionUsed: true,
      canSubmit: true,
    });
  });
});
