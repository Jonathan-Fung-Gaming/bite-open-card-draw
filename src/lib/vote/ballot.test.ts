import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { BallotStore } from "./ballot-store";
import { countBanSelections, isSetChoiceComplete, validateRoundBallot } from "./ballot";

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
    roundSetId: displayLabel === "S16" ? "static-s16" : "static-s17",
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
    expect(
      isSetChoiceComplete({
        drawId: "draw-a",
        roundSetId: "static-a",
        displayLabel: "S16",
        noBans: false,
        bannedChartIds: [],
      }),
    ).toBe(false);
    expect(
      isSetChoiceComplete({
        drawId: "draw-a",
        roundSetId: "static-a",
        displayLabel: "S16",
        noBans: true,
        bannedChartIds: [],
      }),
    ).toBe(true);
    expect(
      isSetChoiceComplete({
        drawId: "draw-a",
        roundSetId: "static-a",
        displayLabel: "S16",
        noBans: false,
        bannedChartIds: ["1", "2"],
      }),
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
          {
            drawId: draws[0]?.id ?? "",
            roundSetId: draws[0]?.roundSetId ?? "",
            displayLabel: "S16",
            noBans: false,
            bannedChartIds: [firstChart],
          },
          {
            drawId: draws[1]?.id ?? "",
            roundSetId: draws[1]?.roundSetId ?? "",
            displayLabel: "S17",
            noBans: false,
            bannedChartIds: [secondChart],
          },
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
          {
            drawId: draws[0]?.id ?? "",
            roundSetId: draws[0]?.roundSetId ?? "",
            displayLabel: "S16",
            noBans: true,
            bannedChartIds: [],
          },
          {
            drawId: draws[1]?.id ?? "",
            roundSetId: draws[1]?.roundSetId ?? "",
            displayLabel: "S17",
            noBans: false,
            bannedChartIds: [secondChart],
          },
        ],
      },
      draws,
      "second",
    );

    expect(second.id).toBe(first.id);
    expect(second.revision).toBe(2);
    expect(store.get(1, "player-1")?.submittedAt).toBe("second");
  });

  it("rotates player edit token hashes and clears them for manual admin ballots", () => {
    const store = new BallotStore();
    const draws = [draw("set-1", "S16", "16"), draw("set-2", "S17", "17")];
    const input = {
      roundNumber: 1 as const,
      playerId: "player-token",
      playerStartggUsername: "TokenPlayer",
      choices: [
        {
          drawId: draws[0]?.id ?? "",
          roundSetId: draws[0]?.roundSetId ?? "",
          displayLabel: "S16",
          noBans: true,
          bannedChartIds: [],
        },
        {
          drawId: draws[1]?.id ?? "",
          roundSetId: draws[1]?.roundSetId ?? "",
          displayLabel: "S17",
          noBans: true,
          bannedChartIds: [],
        },
      ],
    };

    const first = store.submit(input, draws, "first", { editTokenHash: "hash-a" });
    const second = store.submit(input, draws, "second", { editTokenHash: "hash-b" });
    const manual = store.submit(input, draws, "manual", { source: "manual_admin" });

    expect(first.editTokenHash).toBe("hash-a");
    expect(second.editTokenHash).toBe("hash-b");
    expect(manual.editTokenHash).toBeNull();
    expect(store.get(1, "player-token")?.editTokenHash).toBeNull();
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
          {
            drawId: draws[0]?.id ?? "",
            roundSetId: draws[0]?.roundSetId ?? "",
            displayLabel: "S16",
            noBans: false,
            bannedChartIds: [firstChart],
          },
          {
            drawId: draws[1]?.id ?? "",
            roundSetId: draws[1]?.roundSetId ?? "",
            displayLabel: "S17",
            noBans: true,
            bannedChartIds: [],
          },
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
          {
            drawId: draws[0]?.id ?? "",
            roundSetId: draws[0]?.roundSetId ?? "",
            displayLabel: "S16",
            noBans: false,
            bannedChartIds: [firstChart],
          },
          {
            drawId: draws[1]?.id ?? "",
            roundSetId: draws[1]?.roundSetId ?? "",
            displayLabel: "S17",
            noBans: true,
            bannedChartIds: [],
          },
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

  it("rejects static round-set ids when an active draw id is required", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];

    expect(() =>
      validateRoundBallot(
        {
          roundNumber: 1,
          playerId: "player-4",
          playerStartggUsername: "WrongIdPlayer",
          choices: [
            {
              drawId: draws[0]?.roundSetId ?? "",
              roundSetId: draws[0]?.roundSetId ?? "",
              displayLabel: "S16",
              noBans: true,
              bannedChartIds: [],
            },
            {
              drawId: draws[1]?.id ?? "",
              roundSetId: draws[1]?.roundSetId ?? "",
              displayLabel: "S17",
              noBans: true,
              bannedChartIds: [],
            },
          ],
        },
        draws,
      ),
    ).toThrow(/active draw/);
  });

  it("rejects choices whose static set does not match the active draw", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];

    expect(() =>
      validateRoundBallot(
        {
          roundNumber: 1,
          playerId: "player-5",
          playerStartggUsername: "MismatchPlayer",
          choices: [
            {
              drawId: draws[0]?.id ?? "",
              roundSetId: draws[1]?.roundSetId ?? "",
              displayLabel: "S16",
              noBans: true,
              bannedChartIds: [],
            },
            {
              drawId: draws[1]?.id ?? "",
              roundSetId: draws[1]?.roundSetId ?? "",
              displayLabel: "S17",
              noBans: true,
              bannedChartIds: [],
            },
          ],
        },
        draws,
      ),
    ).toThrow(/static round set/);
  });
});
