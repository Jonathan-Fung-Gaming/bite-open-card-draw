import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { BallotStore } from "./ballot-store";
import {
  MAX_BANS_PER_ROUND_BALLOT,
  MAX_BANS_PER_SET,
  countBanSelections,
  isSetChoiceComplete,
  validateRoundBallot,
} from "./ballot";

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

function validBallotInput(draws: DrawRecord[]) {
  return {
    roundNumber: 1 as const,
    playerId: "player-valid",
    playerStartggUsername: "ValidPlayer",
    choices: draws.map((candidate) => ({
      drawId: candidate.id,
      roundSetId: candidate.roundSetId,
      displayLabel: candidate.displayLabel,
      noBans: false,
      bannedChartIds: [candidate.charts[0]?.id ?? ""],
    })),
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

  it("documents that one ballot can cast up to four bans across both sets", () => {
    const store = new BallotStore();
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];

    for (const playerNumber of [1, 2, 3, 4]) {
      store.submit(
        {
          roundNumber: 1,
          playerId: `player-${playerNumber}`,
          playerStartggUsername: `Player ${playerNumber}`,
          choices: draws.map((candidate) => ({
            drawId: candidate.id,
            roundSetId: candidate.roundSetId,
            displayLabel: candidate.displayLabel,
            noBans: false,
            bannedChartIds: candidate.charts
              .slice(playerNumber - 1, playerNumber + 1)
              .map((chart) => chart.id),
          })),
        },
        draws,
        `submitted-${playerNumber}`,
      );
    }

    const ballots = store.listForRound(1);
    const perSetBanTotals = draws.map((candidate) =>
      ballots.reduce((total, ballot) => {
        const choice = ballot.choices.find((ballotChoice) => ballotChoice.drawId === candidate.id);

        return total + (choice?.bannedChartIds.length ?? 0);
      }, 0),
    );

    expect(ballots).toHaveLength(4);
    expect(countBanSelections(ballots)).toBe(ballots.length * MAX_BANS_PER_ROUND_BALLOT);
    expect(countBanSelections(ballots)).toBeLessThanOrEqual(
      ballots.length * MAX_BANS_PER_ROUND_BALLOT,
    );
    for (const perSetBanTotal of perSetBanTotals) {
      expect(perSetBanTotal).toBeLessThanOrEqual(ballots.length * MAX_BANS_PER_SET);
    }
  });

  it("treats fifteen ban selections from four ballots as a valid across-both-sets total", () => {
    const store = new BallotStore();
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const fullBanChoices = (playerNumber: number) =>
      draws.map((candidate) => ({
        drawId: candidate.id,
        roundSetId: candidate.roundSetId,
        displayLabel: candidate.displayLabel,
        noBans: false,
        bannedChartIds: candidate.charts
          .slice(playerNumber - 1, playerNumber + 1)
          .map((chart) => chart.id),
      }));

    for (const playerNumber of [1, 2, 3]) {
      store.submit(
        {
          roundNumber: 1,
          playerId: `player-${playerNumber}`,
          playerStartggUsername: `Player ${playerNumber}`,
          choices: fullBanChoices(playerNumber),
        },
        draws,
        `submitted-${playerNumber}`,
      );
    }
    store.submit(
      {
        roundNumber: 1,
        playerId: "player-4",
        playerStartggUsername: "Player 4",
        choices: [
          fullBanChoices(4)[0]!,
          {
            drawId: draws[1]!.id,
            roundSetId: draws[1]!.roundSetId,
            displayLabel: draws[1]!.displayLabel,
            noBans: false,
            bannedChartIds: [draws[1]!.charts[4]!.id],
          },
        ],
      },
      draws,
      "submitted-4",
    );

    const ballots = store.listForRound(1);

    expect(ballots).toHaveLength(4);
    expect(countBanSelections(ballots)).toBe(15);
    expect(countBanSelections(ballots)).toBeLessThanOrEqual(
      ballots.length * MAX_BANS_PER_ROUND_BALLOT,
    );
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

  it("warns a second active device and keeps only the latest valid same-player ballot", () => {
    const store = new BallotStore();
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    const firstDevicePresence = store.claimVoterPresence({
      roundNumber: 1,
      playerId: input.playerId,
      deviceId: "phone-a",
      nowMs: 1_000,
    });
    const secondDevicePresence = store.claimVoterPresence({
      roundNumber: 1,
      playerId: input.playerId,
      deviceId: "phone-b",
      nowMs: 2_000,
    });

    const phoneABallot = store.submit(input, draws, "2026-07-03T00:01:00.000Z", {
      editTokenHash: "phone-a-token",
    });
    const phoneBChoices = [
      {
        ...input.choices[0]!,
        noBans: true,
        bannedChartIds: [],
      },
      {
        ...input.choices[1]!,
        bannedChartIds: [draws[1]!.charts[1]!.id],
      },
    ];
    const phoneBBallot = store.submit(
      {
        ...input,
        choices: phoneBChoices,
      },
      draws,
      "2026-07-03T00:01:05.000Z",
      { editTokenHash: "phone-b-token" },
    );

    expect(firstDevicePresence.hasOtherActiveDevice).toBe(false);
    expect(secondDevicePresence).toMatchObject({
      hasOtherActiveDevice: true,
      otherActiveDeviceCount: 1,
    });
    expect(phoneBBallot.id).toBe(phoneABallot.id);
    expect(phoneBBallot.revision).toBe(2);
    expect(phoneBBallot.editTokenHash).toBe("phone-b-token");
    expect(store.listForRound(1)).toHaveLength(1);
    expect(store.get(1, input.playerId)).toMatchObject({
      submittedAt: "2026-07-03T00:01:05.000Z",
      firstSubmittedAt: "2026-07-03T00:01:00.000Z",
      choices: phoneBChoices,
    });

    expect(() =>
      store.submit(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: ["stale-chart-id"],
            },
            input.choices[1]!,
          ],
        },
        draws,
        "2026-07-03T00:01:10.000Z",
        { editTokenHash: "phone-a-token" },
      ),
    ).toThrow(/outside the drawn set/);

    expect(store.get(1, input.playerId)).toMatchObject({
      submittedAt: "2026-07-03T00:01:05.000Z",
      revision: 2,
      editTokenHash: "phone-b-token",
      choices: phoneBChoices,
    });
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

  it("rejects incomplete ballots server-side", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    expect(() =>
      validateRoundBallot(
        {
          ...input,
          choices: [input.choices[0]!],
        },
        draws,
      ),
    ).toThrow(/Both chart sets/);
  });

  it("rejects ballot submission before both sets are drawn", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    expect(() => validateRoundBallot(input, [draws[0]!])).toThrow(/Both chart sets must be drawn/);
  });

  it("rejects third bans server-side", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    expect(() =>
      validateRoundBallot(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: draws[0]!.charts.slice(0, 3).map((chart) => chart.id),
            },
            input.choices[1]!,
          ],
        },
        draws,
      ),
    ).toThrow(/Both chart sets/);
  });

  it("rejects stale chart ids server-side", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    expect(() =>
      validateRoundBallot(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: ["stale-chart-id"],
            },
            input.choices[1]!,
          ],
        },
        draws,
      ),
    ).toThrow(/outside the drawn set/);
  });

  it("rejects duplicate chart bans server-side", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);
    const chartId = draws[0]!.charts[0]!.id;

    expect(() =>
      validateRoundBallot(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: [chartId, chartId],
            },
            input.choices[1]!,
          ],
        },
        draws,
      ),
    ).toThrow(/Duplicate chart bans/);
  });

  it("rejects no-bans plus bans combinations server-side", () => {
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    expect(() =>
      validateRoundBallot(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              noBans: true,
            },
            input.choices[1]!,
          ],
        },
        draws,
      ),
    ).toThrow(/Both chart sets/);
  });

  it("preserves the prior valid ballot when an edit fails validation", () => {
    const store = new BallotStore();
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);
    const first = store.submit(input, draws, "first");

    expect(() =>
      store.submit(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: ["stale-chart-id"],
            },
            input.choices[1]!,
          ],
        },
        draws,
        "failed-edit",
      ),
    ).toThrow(/outside the drawn set/);

    expect(store.get(1, "player-valid")).toEqual(first);
  });

  it("round-trips only the latest valid revision after a later edit fails", () => {
    const store = new BallotStore();
    const draws = [draw("draw-1", "S16", "16"), draw("draw-2", "S17", "17")];
    const input = validBallotInput(draws);

    store.submit(input, draws, "first");
    const latestValid = store.submit(
      {
        ...input,
        choices: [
          {
            ...input.choices[0]!,
            noBans: true,
            bannedChartIds: [],
          },
          input.choices[1]!,
        ],
      },
      draws,
      "second",
    );

    expect(() =>
      store.submit(
        {
          ...input,
          choices: [
            {
              ...input.choices[0]!,
              bannedChartIds: ["stale-chart-id"],
            },
            input.choices[1]!,
          ],
        },
        draws,
        "failed-third",
      ),
    ).toThrow(/outside the drawn set/);

    const restored = new BallotStore();

    restored.importSnapshot(store.exportSnapshot());

    expect(restored.get(1, "player-valid")).toMatchObject({
      id: latestValid.id,
      submittedAt: "second",
      revision: 2,
      choices: latestValid.choices,
    });
    expect(restored.get(1, "player-valid")?.choices[0]?.noBans).toBe(true);
  });
});
