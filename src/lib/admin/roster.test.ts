import { describe, expect, it } from "vitest";
import { VotingWindowStore } from "@/lib/vote/voting-window";
import { RosterStore } from "./roster";

describe("roster store", () => {
  it("blocks duplicate active start.gg usernames", () => {
    const store = new RosterStore();

    store.createOrUpdatePlayer({ startggUsername: "PlayerOne", active: true, now: "now" });

    expect(() =>
      store.createOrUpdatePlayer({ startggUsername: " playerone ", active: true, now: "later" }),
    ).toThrow("Active start.gg username already exists");
  });

  it("edits a start.gg username before tournament history exists", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({
      startggUsername: "TypoName",
      active: true,
      now: "now",
    });

    const edited = store.createOrUpdatePlayer({
      playerId: player.id,
      startggUsername: "Correct Name",
      now: "later",
    });

    expect(edited.startggUsername).toBe("Correct Name");
    expect(store.listPlayers()[0]?.normalizedUsername).toBe("correct name");
  });

  it("rejects username edits after tournament history exists", () => {
    const store = new RosterStore();

    store.importSnapshot({
      players: [
        {
          id: "player-1",
          startggUsername: "LockedName",
          normalizedUsername: "lockedname",
          active: true,
          hasTournamentHistory: true,
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      currentRoundEligibility: [],
    });

    expect(() =>
      store.createOrUpdatePlayer({
        playerId: "player-1",
        startggUsername: "New Name",
        now: "later",
      }),
    ).toThrow("Cannot edit a start.gg username after tournament history exists.");
  });

  it("sets tournament history after player ballot submission and locks username edits", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({
      startggUsername: "Player Ballot",
      active: true,
      now: "created",
    });

    const locked = store.markTournamentHistory(player.id, "submitted");

    expect(locked.hasTournamentHistory).toBe(true);
    expect(locked.updatedAt).toBe("submitted");
    expect(() =>
      store.createOrUpdatePlayer({
        playerId: player.id,
        startggUsername: "Player Renamed",
        now: "later",
      }),
    ).toThrow("Cannot edit a start.gg username after tournament history exists.");
  });

  it("sets tournament history after manual ballot submission and persists through snapshots", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({
      startggUsername: "Manual Ballot",
      active: true,
      now: "created",
    });

    store.markTournamentHistory(player.id, "manual-submitted");

    const restored = new RosterStore();
    restored.importSnapshot(store.exportSnapshot());

    expect(restored.getPlayer(player.id)?.hasTournamentHistory).toBe(true);
    expect(() =>
      restored.createOrUpdatePlayer({
        playerId: player.id,
        startggUsername: "Manual Renamed",
        now: "later",
      }),
    ).toThrow("Cannot edit a start.gg username after tournament history exists.");
  });

  it("keeps inactive players visible and restorable", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({
      startggUsername: "PlayerTwo",
      active: true,
      now: "now",
    });

    store.setPlayerActiveStatus(player.id, false, "later");
    expect(store.listPlayers()[0]?.active).toBe(false);

    store.setPlayerActiveStatus(player.id, true, "latest");
    expect(store.listPlayers()[0]?.active).toBe(true);
  });

  it("requires a reason for emergency current-round eligibility", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({
      startggUsername: "PlayerThree",
      active: false,
      now: "now",
    });

    expect(() =>
      store.addPlayerToCurrentRoundEligibility({
        playerId: player.id,
        roundNumber: 1,
        reason: "",
      }),
    ).toThrow("Audit reason is required");
  });

  it("includes emergency current-round players in the round eligibility list", () => {
    const store = new RosterStore();
    const active = store.createOrUpdatePlayer({
      startggUsername: "ActivePlayer",
      active: true,
      now: "now",
    });
    const inactive = store.createOrUpdatePlayer({
      startggUsername: "InactivePlayer",
      active: false,
      now: "now",
    });

    store.addPlayerToCurrentRoundEligibility({
      playerId: inactive.id,
      roundNumber: 1,
      reason: "late correction",
    });

    expect(store.listEligiblePlayersForRound(1).map((player) => player.id)).toEqual([
      active.id,
      inactive.id,
    ]);
  });

  it("preserves the opened-round eligibility snapshot across reroll and routine reactivation", () => {
    const roster = new RosterStore();
    const voting = new VotingWindowStore();
    const alpha = roster.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "2026-07-13T00:00:00.000Z",
    });
    const bravo = roster.createOrUpdatePlayer({
      startggUsername: "Bravo",
      active: true,
      now: "2026-07-13T00:00:00.000Z",
    });
    const charlie = roster.createOrUpdatePlayer({
      startggUsername: "Charlie",
      active: false,
      now: "2026-07-13T00:00:00.000Z",
    });
    const initialEligibility = roster.listEligiblePlayersForRound(1);

    voting.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: initialEligibility,
      nowMs: 0,
    });
    roster.snapshotRoundEligibility({
      roundNumber: 1,
      playerIds: initialEligibility.map((player) => player.id),
      now: "2026-07-13T00:00:00.000Z",
    });

    // Routine roster changes after opening affect future rounds only.
    roster.setPlayerActiveStatus(bravo.id, false, "2026-07-13T00:01:00.000Z");
    roster.setPlayerActiveStatus(charlie.id, true, "2026-07-13T00:01:00.000Z");

    // A post-open reroll resets the voting window, not the authoritative roster snapshot.
    voting.resetRound(1);
    const restartedEligibility = roster.listEligiblePlayersForRound(1);
    voting.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: restartedEligibility,
      nowMs: 120_000,
    });

    expect(restartedEligibility.map((player) => player.id)).toEqual([alpha.id, bravo.id]);
    expect(voting.exportSnapshot().windows[0]?.eligiblePlayers.map((player) => player.id)).toEqual([
      alpha.id,
      bravo.id,
    ]);
    expect(roster.listEligiblePlayersForRound(2).map((player) => player.id)).toEqual([
      alpha.id,
      charlie.id,
    ]);
  });
});
