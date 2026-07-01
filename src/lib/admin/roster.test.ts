import { describe, expect, it } from "vitest";
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

  it("keeps inactive players visible and restorable", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({ startggUsername: "PlayerTwo", active: true, now: "now" });

    store.setPlayerActiveStatus(player.id, false, "later");
    expect(store.listPlayers()[0]?.active).toBe(false);

    store.setPlayerActiveStatus(player.id, true, "latest");
    expect(store.listPlayers()[0]?.active).toBe(true);
  });

  it("requires a reason for emergency current-round eligibility", () => {
    const store = new RosterStore();
    const player = store.createOrUpdatePlayer({ startggUsername: "PlayerThree", active: false, now: "now" });

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
    const active = store.createOrUpdatePlayer({ startggUsername: "ActivePlayer", active: true, now: "now" });
    const inactive = store.createOrUpdatePlayer({ startggUsername: "InactivePlayer", active: false, now: "now" });

    store.addPlayerToCurrentRoundEligibility({
      playerId: inactive.id,
      roundNumber: 1,
      reason: "late correction",
    });

    expect(store.listEligiblePlayersForRound(1).map((player) => player.id)).toEqual([active.id, inactive.id]);
  });
});
