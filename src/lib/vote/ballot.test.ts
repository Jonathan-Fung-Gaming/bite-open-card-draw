import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { BallotStore } from "./ballot-store";
import { countBanSelections, isSetChoiceComplete } from "./ballot";

function draw(id: string, displayLabel: string, level: string): DrawRecord {
  const charts = Array.from({ length: 7 }, (_, index) =>
    normalizeChartRow(
      {
        name: `${displayLabel} Song ${index}`,
        name_kr: `${displayLabel} Song ${index}`,
        artist: "Artist",
        label: "test",
        type: "s",
        level,
        bg_img: "",
      },
      index + 2,
    ),
  );

  return {
    id,
    roundNumber: 1,
    setOrder: displayLabel === "S16" ? 1 : 2,
    displayLabel,
    version: 1,
    eligiblePoolCount: 20,
    charts,
    createdAt: "now",
    supersededAt: null,
    reason: "test",
  };
}

describe("ballot validation and store", () => {
  it("requires either 1-2 bans or explicit no bans per set", () => {
    expect(isSetChoiceComplete({ roundSetId: "a", displayLabel: "S16", noBans: false, bannedChartIds: [] })).toBe(
      false,
    );
    expect(isSetChoiceComplete({ roundSetId: "a", displayLabel: "S16", noBans: true, bannedChartIds: [] })).toBe(
      true,
    );
    expect(
      isSetChoiceComplete({ roundSetId: "a", displayLabel: "S16", noBans: false, bannedChartIds: ["1", "2"] }),
    ).toBe(true);
  });

  it("keeps the latest valid submitted ballot for a player", () => {
    const store = new BallotStore();
    const draws = [draw("set-1", "S16", "16"), draw("set-2", "S17", "17")];
    const firstChart = draws[0]?.charts[0]?.id ?? "";
    const secondChart = draws[1]?.charts[0]?.id ?? "";

    const first = store.submit(
      {
        roundNumber: 1,
        playerId: "player-1",
        playerStartggUsername: "PlayerOne",
        choices: [
          { roundSetId: "set-1", displayLabel: "S16", noBans: false, bannedChartIds: [firstChart] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: false, bannedChartIds: [secondChart] },
        ],
      },
      draws,
      "first",
    );
    const second = store.submit(
      {
        roundNumber: 1,
        playerId: "player-1",
        playerStartggUsername: "PlayerOne",
        choices: [
          { roundSetId: "set-1", displayLabel: "S16", noBans: true, bannedChartIds: [] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: false, bannedChartIds: [secondChart] },
        ],
      },
      draws,
      "second",
    );

    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(2);
    expect(store.get(1, "player-1")?.submittedAt).toBe("second");
  });

  it("exposes phone status for closed and revealed states", () => {
    const store = new BallotStore();

    expect(store.getPhoneStatus(1).phase).toBe("voting_open");

    store.setPhoneStatus(1, { phase: "closed_revealing" });
    expect(store.getPhoneStatus(1).phase).toBe("closed_revealing");

    store.setPhoneStatus(1, {
      phase: "revealed",
      selectedCharts: [{ id: "chart", name: "Song", artist: "Artist", displayDifficulty: "S16" }],
    });
    expect(store.getPhoneStatus(1).phase).toBe("revealed");
  });

  it("warns when another active device has claimed the same player", () => {
    const store = new BallotStore();

    const first = store.claimVoterPresence({
      roundNumber: 1,
      playerId: "player-1",
      deviceId: "device-a",
      nowMs: 1_000,
    });
    const second = store.claimVoterPresence({
      roundNumber: 1,
      playerId: "player-1",
      deviceId: "device-b",
      nowMs: 2_000,
    });
    const afterExpiry = store.claimVoterPresence({
      roundNumber: 1,
      playerId: "player-1",
      deviceId: "device-c",
      nowMs: 200_000,
    });

    expect(first.hasOtherActiveDevice).toBe(false);
    expect(second.hasOtherActiveDevice).toBe(true);
    expect(afterExpiry.hasOtherActiveDevice).toBe(false);
  });

  it("marks post-close manual ballots as overrides for export", () => {
    const store = new BallotStore();
    const draws = [draw("set-1", "S16", "16"), draw("set-2", "S17", "17")];
    const firstChart = draws[0]?.charts[0]?.id ?? "";

    const ballot = store.submit(
      {
        roundNumber: 1,
        playerId: "player-2",
        playerStartggUsername: "ManualPlayer",
        choices: [
          { roundSetId: "set-1", displayLabel: "S16", noBans: false, bannedChartIds: [firstChart] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: true, bannedChartIds: [] },
        ],
      },
      draws,
      "manual",
      {
        source: "manual_admin",
        manualReason: "phone died",
        manualOverride: true,
      },
    );

    expect(ballot.source).toBe("manual_admin");
    expect(ballot.manualReason).toBe("phone died");
    expect(ballot.manualOverride).toBe(true);
    expect(countBanSelections([ballot])).toBe(1);
  });

  it("invalidates round ballots with trace metadata for post-vote rerolls", () => {
    const store = new BallotStore();
    const draws = [draw("set-1", "S16", "16"), draw("set-2", "S17", "17")];
    const firstChart = draws[0]?.charts[0]?.id ?? "";

    const ballot = store.submit(
      {
        roundNumber: 1,
        playerId: "player-3",
        playerStartggUsername: "TracePlayer",
        choices: [
          { roundSetId: "set-1", displayLabel: "S16", noBans: false, bannedChartIds: [firstChart] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: true, bannedChartIds: [] },
        ],
      },
      draws,
      "submitted",
    );

    const invalidation = store.invalidateRound({
      roundNumber: 1,
      reason: "post-vote reroll",
      adminSessionId: "session-a",
      invalidatedAt: "invalidated",
    });
    const snapshot = store.exportSnapshot();

    expect(store.listForRound(1)).toHaveLength(0);
    expect(invalidation.ballotIds).toEqual([ballot.id]);
    expect(invalidation.ballots[0]?.playerStartggUsername).toBe("TracePlayer");
    expect(snapshot.ballotInvalidations?.[0]?.reason).toBe("post-vote reroll");
  });
});
