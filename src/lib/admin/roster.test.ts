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
});
