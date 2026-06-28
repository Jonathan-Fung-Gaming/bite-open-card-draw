import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { DrawStateStore } from "@/lib/draw/draw-state";
import { ResultStore } from "@/lib/results/result-store";
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
          { roundSetId: "set-1", displayLabel: "S16", noBans: false, bannedChartIds: [draws[0]?.charts[0]?.id ?? ""] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: true, bannedChartIds: [] },
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
          { roundSetId: "set-1", displayLabel: "S16", noBans: true, bannedChartIds: [] },
          { roundSetId: "set-2", displayLabel: "S17", noBans: false, bannedChartIds: [draws[1]?.charts[0]?.id ?? ""] },
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
            { roundSetId: "set-1", displayLabel: "S16", noBans: false, bannedChartIds: [draws[0]?.charts[0]?.id ?? ""] },
            { roundSetId: "set-2", displayLabel: "S17", noBans: true, bannedChartIds: [] },
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
            { roundSetId: "set-1", displayLabel: "S16", noBans: true, bannedChartIds: [] },
            { roundSetId: "set-2", displayLabel: "S17", noBans: false, bannedChartIds: [draws[1]?.charts[0]?.id ?? ""] },
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
