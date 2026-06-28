import { describe, expect, it } from "vitest";
import { FINAL_CHANGE_MS, ONE_MINUTE_MS, TEN_MINUTES_MS, VotingWindowStore } from "./voting-window";

const players = [
  { id: "player-1", startggUsername: "Alpha" },
  { id: "player-2", startggUsername: "Bravo" },
  { id: "player-3", startggUsername: "Charlie" },
  { id: "player-4", startggUsername: "Delta" },
];

function snapshot(
  store: VotingWindowStore,
  submittedPlayerIds: string[],
  nowMs: number,
  eligiblePlayers = players,
) {
  return store.getSnapshot({
    roundNumber: 1,
    drawnSetCount: 2,
    eligiblePlayers,
    submittedPlayerIds,
    banSelectionsCast: submittedPlayerIds.length * 2,
    nowMs,
  });
}

describe("voting window store", () => {
  it("opens one 10-minute window from server time after both sets are drawn", () => {
    const store = new VotingWindowStore(() => 1_000);

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players,
      nowMs: 1_000,
    });

    const view = snapshot(store, [], 1_000);

    expect(view.status).toBe("voting_open");
    expect(view.remainingMs).toBe(TEN_MINUTES_MS);
    expect(view.canSubmit).toBe(true);
    expect(view.eligibleCount).toBe(4);
  });

  it("extends once by one minute when turnout is below 75 percent at normal expiration", () => {
    const store = new VotingWindowStore();

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players,
      nowMs: 0,
    });

    const extended = snapshot(store, ["player-1", "player-2"], TEN_MINUTES_MS);

    expect(extended.status).toBe("extension_1_minute");
    expect(extended.extensionUsed).toBe(true);
    expect(extended.remainingMs).toBe(ONE_MINUTE_MS);

    const closed = snapshot(store, ["player-1", "player-2"], TEN_MINUTES_MS + ONE_MINUTE_MS);

    expect(closed.status).toBe("voting_closed");
    expect(closed.canSubmit).toBe(false);
  });

  it("enters a 30-second final-change mode when every eligible player submits early", () => {
    const store = new VotingWindowStore();

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players.slice(0, 2),
      nowMs: 0,
    });

    const finalWarning = snapshot(store, ["player-1", "player-2"], 5_000, players.slice(0, 2));

    expect(finalWarning.status).toBe("final_30_seconds");
    expect(finalWarning.remainingMs).toBe(FINAL_CHANGE_MS);
    expect(finalWarning.canSubmit).toBe(true);

    const closed = snapshot(store, ["player-1", "player-2"], 5_000 + FINAL_CHANGE_MS, players.slice(0, 2));

    expect(closed.status).toBe("voting_closed");
  });

  it("pauses and resumes without losing remaining official time", () => {
    const store = new VotingWindowStore();

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players,
      nowMs: 0,
    });
    store.pauseVoting(1, 2 * 60 * 1000);

    const paused = snapshot(store, [], 5 * 60 * 1000);

    expect(paused.status).toBe("voting_paused");
    expect(paused.remainingMs).toBe(8 * 60 * 1000);
    expect(paused.canSubmit).toBe(false);

    store.resumeVoting(1, 6 * 60 * 1000);
    const resumed = snapshot(store, [], 6 * 60 * 1000);

    expect(resumed.status).toBe("voting_open");
    expect(resumed.remainingMs).toBe(8 * 60 * 1000);
  });

  it("adds emergency current-round eligibility to an already-open voting snapshot", () => {
    const store = new VotingWindowStore();

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players.slice(0, 2),
      nowMs: 0,
    });

    const before = snapshot(store, ["player-1"], 1_000, players);

    expect(before.eligibleCount).toBe(2);
    expect(before.submittedCount).toBe(1);

    store.addEligiblePlayerToOpenRound({
      roundNumber: 1,
      player: players[2] ?? { id: "player-3", startggUsername: "Charlie" },
      nowMs: 2_000,
    });

    const after = snapshot(store, ["player-1"], 2_000, players);

    expect(after.eligiblePlayers.map((player) => player.id)).toEqual([
      "player-1",
      "player-2",
      "player-3",
    ]);
    expect(after.eligibleCount).toBe(3);
    expect(after.submittedCount).toBe(1);
    expect(after.turnoutRatio).toBeCloseTo(1 / 3);
  });

  it("blocks manual ballots after results reveal", () => {
    const store = new VotingWindowStore();

    store.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: players,
      nowMs: 0,
    });
    store.closeVoting(1, 1_000);
    expect(snapshot(store, [], 1_000).canAcceptManualBallot).toBe(true);

    store.setResultsPhase(1, "results_revealed");
    expect(snapshot(store, [], 2_000).canAcceptManualBallot).toBe(false);
  });
});
