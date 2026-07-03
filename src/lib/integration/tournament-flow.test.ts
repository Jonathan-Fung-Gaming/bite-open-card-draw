import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import { evaluateRoundDrawReadiness } from "@/lib/draw/round-readiness";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { DrawStateStore } from "@/lib/draw/draw-state";
import { ResultStore } from "@/lib/results/result-store";
import {
  selectedSongBlocksFromResultStoreBeforeRound,
  syncSelectedSongBlocksFromResultStore,
} from "@/lib/results/selected-song-blocks";
import { RosterStore } from "@/lib/admin/roster";
import { BallotStore } from "@/lib/vote/ballot-store";
import { VotingWindowStore } from "@/lib/vote/voting-window";

function chartsFor(type: "s" | "d", level: string, count: number, startRow: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    normalizeChartRow(
      {
        name: `${prefix} ${index}`,
        name_kr: `${prefix} ${index}`,
        artist: "Artist",
        label: "test",
        type,
        level,
        bg_img: "",
      },
      startRow + index,
    ),
  );
}

function draw(id: string, setOrder: 1 | 2, label: string): DrawRecord {
  const charts = chartsFor("s", setOrder === 1 ? "16" : "17", 7, setOrder * 100, label).map((chart) => ({
    id: chart.id,
    name: chart.name,
    artist: chart.artist,
    displayDifficulty: chart.displayDifficulty,
    songKey: chart.songKey,
    chartKey: chart.chartKey,
    sourceBgImg: chart.sourceBgImg,
    localImagePath: chart.localImagePath,
  }));

  return {
    id,
    roundSetId: `static-${label.toLowerCase()}`,
    roundNumber: 1,
    setOrder,
    displayLabel: label,
    version: 1,
    eligiblePoolCount: charts.length,
    charts,
    createdAt: "drawn",
    supersededAt: null,
    reason: "test",
  };
}

describe("tournament integration hardening", () => {
  it("runs a full round flow and blocks ballot changes after final reveal", () => {
    const roster = new RosterStore();
    const players = ["Alpha", "Bravo", "Charlie", "Delta"].map((startggUsername) =>
      roster.createOrUpdatePlayer({ startggUsername, active: true, now: "roster" }),
    );
    const draws = [draw("set-1", 1, "S16"), draw("set-2", 2, "S17")];
    const voting = new VotingWindowStore();
    const ballots = new BallotStore();
    const results = new ResultStore(() => 0);

    voting.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: roster.listEligiblePlayersForRound(1),
      nowMs: 0,
    });

    const firstSave = ballots.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
        choices: [
          {
            drawId: draws[0]?.id ?? "",
            roundSetId: draws[0]?.roundSetId ?? "",
            displayLabel: "S16",
            noBans: false,
            bannedChartIds: [draws[0]?.charts[0]?.id ?? ""],
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
      "first",
    );
    const edit = ballots.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
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
            bannedChartIds: [draws[1]?.charts[0]?.id ?? ""],
          },
        ],
      },
      draws,
      "edit",
    );

    expect(edit.id).toBe(firstSave.id);
    expect(edit.revision).toBe(2);

    voting.closeVoting(1, 10_000);
    const closed = voting.getSnapshot({
      roundNumber: 1,
      drawnSetCount: 2,
      eligiblePlayers: roster.listEligiblePlayersForRound(1),
      submittedPlayerIds: ballots.listForRound(1).map((ballot) => ballot.playerId),
    });

    const result = results.computeRound({
      roundNumber: 1,
      draws,
      ballots: ballots.listForRound(1),
      eligiblePlayers: closed.eligiblePlayers,
      priorSelectedSongBlocks: [],
      now: closed.serverNow,
    });

    expect(result.sets).toHaveLength(2);
    voting.setResultsPhase(1, "results_revealed");
    expect(
      voting.getSnapshot({
        roundNumber: 1,
        drawnSetCount: 2,
        eligiblePlayers: roster.listEligiblePlayersForRound(1),
        submittedPlayerIds: ballots.listForRound(1).map((ballot) => ballot.playerId),
      }).canSubmit,
    ).toBe(false);
  });

  it("excludes selected Round 1 songs from later round draws", () => {
    const store = new DrawStateStore(() => 0);
    const sharedRoundOne = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "16",
        bg_img: "",
      },
      2,
    );
    const sharedRoundTwo = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "18",
        bg_img: "",
      },
      200,
    );

    store.setChartsForTest([
      sharedRoundOne,
      ...chartsFor("s", "16", 8, 10, "S16"),
      ...chartsFor("s", "17", 8, 30, "S17"),
      sharedRoundTwo,
      ...chartsFor("s", "18", 8, 50, "S18"),
      ...chartsFor("s", "19", 8, 80, "S19"),
    ]);

    const roundOne = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    store.markSelectedSong(roundOne.charts[0]?.songKey ?? "");
    const roundTwo = store.drawRoundSet({ roundNumber: 2, setOrder: 1 });

    expect(roundTwo.charts.map((chart) => chart.songKey)).not.toContain(roundOne.charts[0]?.songKey);
  });

  it("blocks future draws as soon as prior results are computed", () => {
    const drawStore = new DrawStateStore(() => 0);
    const resultStore = new ResultStore(() => 0);
    const sharedRoundOne = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "16",
        bg_img: "",
      },
      2,
    );
    const sharedRoundTwo = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "18",
        bg_img: "",
      },
      200,
    );

    drawStore.setChartsForTest([
      sharedRoundOne,
      ...chartsFor("s", "16", 8, 10, "S16"),
      ...chartsFor("s", "17", 8, 30, "S17"),
      sharedRoundTwo,
      ...chartsFor("s", "18", 8, 50, "S18"),
      ...chartsFor("s", "19", 8, 80, "S19"),
    ]);

    const roundOneDraws = [
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 1 }),
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 2 }),
    ] as const;

    const result = resultStore.computeRound({
      roundNumber: 1,
      draws: roundOneDraws,
      ballots: [],
      eligiblePlayers: [],
      priorSelectedSongBlocks: [],
      now: "computed-before-final-reveal",
    });

    expect(result.revealPhase).toBe("computed");
    syncSelectedSongBlocksFromResultStore(drawStore, resultStore);

    const roundTwo = drawStore.drawRoundSet({ roundNumber: 2, setOrder: 1 });

    expect(result.sets[0].selectedChart.songKey).toBe(sharedRoundOne.songKey);
    expect(roundTwo.charts.map((chart) => chart.songKey)).not.toContain(sharedRoundOne.songKey);
  });

  it("blocks opening or computing a future round with stale selected-song draws", () => {
    const drawStore = new DrawStateStore(() => 0);
    const resultStore = new ResultStore(() => 0);
    const voting = new VotingWindowStore();
    const sharedRoundOne = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "16",
        bg_img: "",
      },
      2,
    );
    const sharedRoundTwo = normalizeChartRow(
      {
        name: "A Shared Winner",
        name_kr: "A Shared Winner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "18",
        bg_img: "",
      },
      200,
    );

    drawStore.setChartsForTest([
      sharedRoundOne,
      ...chartsFor("s", "16", 8, 10, "S16"),
      ...chartsFor("s", "17", 8, 30, "S17"),
      sharedRoundTwo,
      ...chartsFor("s", "18", 8, 50, "S18"),
      ...chartsFor("s", "19", 8, 80, "S19"),
    ]);

    const roundTwoEarlyDraws = [
      drawStore.drawRoundSet({ roundNumber: 2, setOrder: 1 }),
      drawStore.drawRoundSet({ roundNumber: 2, setOrder: 2 }),
    ] as const;
    const roundOneDraws = [
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 1 }),
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 2 }),
    ] as const;

    expect(roundTwoEarlyDraws[0].charts.map((chart) => chart.songKey)).toContain(
      sharedRoundTwo.songKey,
    );

    resultStore.computeRound({
      roundNumber: 1,
      draws: roundOneDraws,
      ballots: [],
      eligiblePlayers: [],
      priorSelectedSongBlocks: [],
      now: "round-one-computed",
    });

    const priorBlocks = selectedSongBlocksFromResultStoreBeforeRound(resultStore, 2);
    const readiness = evaluateRoundDrawReadiness(2, roundTwoEarlyDraws, {
      priorSelectedSongBlocks: priorBlocks,
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.problems).toContainEqual(
      expect.objectContaining({
        reason: "prior_selected_song",
        chartName: "A Shared Winner",
        selectedInRoundNumber: 1,
      }),
    );

    expect(() =>
      voting.openVoting({
        roundNumber: 2,
        drawsReady: readiness.isReady,
        eligiblePlayers: [],
        nowMs: 0,
      }),
    ).toThrow(/both chart sets/i);

    expect(() =>
      resultStore.computeRound({
        roundNumber: 2,
        draws: roundTwoEarlyDraws,
        ballots: [],
        eligiblePlayers: [],
        priorSelectedSongBlocks: priorBlocks,
        now: "round-two-compute-blocked",
      }),
    ).toThrow(/selected in Round 1/);

    syncSelectedSongBlocksFromResultStore(drawStore, resultStore);
    drawStore.rerollRoundSet({ roundNumber: 2, setOrder: 1, reason: "remove stale winner" });
    const correctedRoundTwoDraws = drawStore
      .getRoundDraws(2)
      .filter((draw): draw is DrawRecord => draw !== null);

    expect(
      evaluateRoundDrawReadiness(2, correctedRoundTwoDraws, {
        priorSelectedSongBlocks: priorBlocks,
      }).isReady,
    ).toBe(true);
  });

  it("keeps drawn-but-not-selected songs eligible for later draws", () => {
    const drawStore = new DrawStateStore(() => 0);
    const resultStore = new ResultStore(() => 0);
    const sharedRoundOne = normalizeChartRow(
      {
        name: "Shared Nonwinner",
        name_kr: "Shared Nonwinner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "16",
        bg_img: "",
      },
      2,
    );
    const sharedRoundTwo = normalizeChartRow(
      {
        name: "Shared Nonwinner",
        name_kr: "Shared Nonwinner",
        artist: "Artist",
        label: "test",
        type: "s",
        level: "18",
        bg_img: "",
      },
      200,
    );

    drawStore.setChartsForTest([
      sharedRoundOne,
      ...chartsFor("s", "16", 8, 10, "S16"),
      ...chartsFor("s", "17", 8, 30, "S17"),
      sharedRoundTwo,
      ...chartsFor("s", "18", 8, 50, "S18"),
      ...chartsFor("s", "19", 8, 80, "S19"),
    ]);

    const roundOneDraws = [
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 1 }),
      drawStore.drawRoundSet({ roundNumber: 1, setOrder: 2 }),
    ] as const;

    const result = resultStore.computeRound({
      roundNumber: 1,
      draws: roundOneDraws,
      ballots: [
        {
          id: "ballot-1",
          roundNumber: 1,
          playerId: "player-1",
          playerStartggUsername: "Player 1",
          submittedAt: "submitted",
          revision: 1,
          source: "player",
          manualReason: null,
          manualOverride: false,
          replacedExistingBallot: false,
          choices: [
            {
              drawId: roundOneDraws[0].id,
              roundSetId: roundOneDraws[0].roundSetId,
              displayLabel: roundOneDraws[0].displayLabel,
              noBans: false,
              bannedChartIds: [sharedRoundOne.id],
            },
            {
              drawId: roundOneDraws[1].id,
              roundSetId: roundOneDraws[1].roundSetId,
              displayLabel: roundOneDraws[1].displayLabel,
              noBans: true,
              bannedChartIds: [],
            },
          ],
        },
      ],
      eligiblePlayers: [{ id: "player-1", startggUsername: "Player 1" }],
      priorSelectedSongBlocks: [],
      now: "round-one-computed",
    });

    expect(result.sets[0].selectedChart.songKey).not.toBe(sharedRoundOne.songKey);

    syncSelectedSongBlocksFromResultStore(drawStore, resultStore);
    const roundTwo = drawStore.drawRoundSet({ roundNumber: 2, setOrder: 1 });

    expect(roundTwo.charts.map((chart) => chart.songKey)).toContain(sharedRoundTwo.songKey);
  });

  it("handles 100 eligible players with multiple edits and one final ballot per player", () => {
    const players = Array.from({ length: 100 }, (_, index) => ({
      id: `player-${index}`,
      startggUsername: `Player ${index.toString().padStart(3, "0")}`,
    }));
    const draws = [draw("set-1", 1, "S16"), draw("set-2", 2, "S17")];
    const voting = new VotingWindowStore();
    const ballots = new BallotStore();

    voting.openVoting({ roundNumber: 1, drawsReady: true, eligiblePlayers: players, nowMs: 0 });

    for (const player of players) {
      ballots.submit(
        {
          roundNumber: 1,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
          choices: [
            {
              drawId: draws[0]?.id ?? "",
              roundSetId: draws[0]?.roundSetId ?? "",
              displayLabel: "S16",
              noBans: false,
              bannedChartIds: [draws[0]?.charts[0]?.id ?? ""],
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
        "first",
      );
      ballots.submit(
        {
          roundNumber: 1,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
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
              bannedChartIds: [draws[1]?.charts[0]?.id ?? ""],
            },
          ],
        },
        draws,
        "edit",
      );
    }

    const snapshot = voting.getSnapshot({
      roundNumber: 1,
      drawnSetCount: 2,
      eligiblePlayers: players,
      submittedPlayerIds: ballots.listForRound(1).map((ballot) => ballot.playerId),
      nowMs: 5_000,
    });

    expect(ballots.listForRound(1)).toHaveLength(100);
    expect(ballots.listForRound(1).every((ballot) => ballot.revision === 2)).toBe(true);
    expect(snapshot.status).toBe("final_30_seconds");
  });
});
