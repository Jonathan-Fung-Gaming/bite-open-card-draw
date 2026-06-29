import { describe, expect, it } from "vitest";
import { RosterStore } from "@/lib/admin/roster";
import { normalizeChartRow } from "@/lib/charts/normalize";
import { DrawStateStore, type DrawRecord } from "@/lib/draw/draw-state";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
  type AdminStateStores,
} from "@/lib/persistence/operational-state";
import { MemoryOperationalStateRepository } from "@/lib/persistence/repository";
import { generatePrivateBallotCsv } from "@/lib/results/private-csv";
import { ResultStore } from "@/lib/results/result-store";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";

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

function testCharts() {
  return [
    ...chartsFor("s", "16", 10, 10, "S16"),
    ...chartsFor("s", "17", 10, 40, "S17"),
  ];
}

async function persistAndRestore(
  repository: MemoryOperationalStateRepository,
  stores: AdminStateStores,
  createStores: () => AdminStateStores = createAdminStateStores,
) {
  await repository.save(createOperationalStateSnapshot(stores, "saved"));

  const snapshot = await repository.load();

  if (!snapshot) {
    throw new Error("Expected repository snapshot.");
  }

  const restored = createStores();
  restoreOperationalStateSnapshot(restored, snapshot);

  return restored;
}

function activeDraws(stores: AdminStateStores, roundNumber: 1 | 2 | 3 | 4 = 1) {
  const first = stores.drawStateStore.getActiveDraw(roundNumber, 1);
  const second = stores.drawStateStore.getActiveDraw(roundNumber, 2);

  if (!first || !second) {
    throw new Error(`Expected both Round ${roundNumber} draws.`);
  }

  return [first, second] as const;
}

function choice(draw: DrawRecord, bannedChartIds: string[]) {
  return {
    roundSetId: draw.id,
    displayLabel: draw.displayLabel,
    noBans: bannedChartIds.length === 0,
    bannedChartIds,
  };
}

function createDeterministicStores(): AdminStateStores {
  return {
    ...createAdminStateStores(),
    rosterStore: new RosterStore(),
    drawStateStore: new DrawStateStore(() => 0),
    resultStore: new ResultStore(() => 0),
  };
}

function sharedChartFor(
  set: RoundSetDefinition,
  sharedIndex: number,
  sourceRowNumber: number,
) {
  return normalizeChartRow(
    {
      name: `Shared Song ${sharedIndex.toString().padStart(2, "0")}`,
      name_kr: `Shared Song ${sharedIndex.toString().padStart(2, "0")}`,
      artist: "Shared Artist",
      label: "test",
      type: set.chartType.toLowerCase(),
      level: String(set.chartLevel),
      bg_img: "",
    },
    sourceRowNumber,
  );
}

function uniqueChartFor(
  set: RoundSetDefinition,
  uniqueIndex: number,
  sourceRowNumber: number,
) {
  return normalizeChartRow(
    {
      name: `${set.displayLabel} Unique ${uniqueIndex.toString().padStart(2, "0")}`,
      name_kr: `${set.displayLabel} Unique ${uniqueIndex.toString().padStart(2, "0")}`,
      artist: "Unique Artist",
      label: "test",
      type: set.chartType.toLowerCase(),
      level: String(set.chartLevel),
      bg_img: "",
    },
    sourceRowNumber,
  );
}

function fourRoundRehearsalCharts() {
  let sourceRowNumber = 1_000;

  return ROUND_SET_DEFINITIONS.flatMap((set) => [
    ...Array.from({ length: 20 }, (_, index) =>
      sharedChartFor(set, index, sourceRowNumber++),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      uniqueChartFor(set, index, sourceRowNumber++),
    ),
  ]);
}

function revealFinal(stores: AdminStateStores, roundNumber: 1 | 2 | 3 | 4) {
  const baseMs = Date.UTC(2026, 5, 29, roundNumber, 0, 0);

  stores.resultStore.advanceReveal(roundNumber, new Date(baseMs).toISOString());
  stores.resultStore.advanceReveal(roundNumber, new Date(baseMs + 1_000).toISOString());
  stores.resultStore.advanceReveal(roundNumber, new Date(baseMs + 7_000).toISOString());
  stores.resultStore.advanceReveal(roundNumber, new Date(baseMs + 8_000).toISOString());
  stores.resultStore.advanceReveal(roundNumber, new Date(baseMs + 14_000).toISOString());
}

describe("repository-backed tournament integration", () => {
  it("persists roster, host lock, draws, voting window, ballots, and results through the repository", async () => {
    const repository = new MemoryOperationalStateRepository();
    let stores = createAdminStateStores();

    stores.drawStateStore.setChartsForTest(testCharts());
    const players = ["Alpha", "Bravo", "Charlie", "Delta"].map((startggUsername) =>
      stores.rosterStore.createOrUpdatePlayer({ startggUsername, active: true, now: "roster" }),
    );
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);
    stores = await persistAndRestore(repository, stores);

    expect(stores.rosterStore.listPlayers()).toHaveLength(4);
    expect(stores.hostLockStore.getSnapshot("session-a", 1_000).status).toBe("active");

    stores.drawStateStore.setChartsForTest(testCharts());
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });
    stores.votingWindowStore.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      nowMs: 0,
    });
    stores = await persistAndRestore(repository, stores);

    const draws = activeDraws(stores);
    const player = players[0];

    stores.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: player?.id ?? "",
        playerStartggUsername: player?.startggUsername ?? "",
        choices: [choice(draws[0], [draws[0].charts[0]?.id ?? ""]), choice(draws[1], [])],
      },
      draws,
      "submitted",
    );
    stores.votingWindowStore.closeVoting(1, 10_000);
    stores = await persistAndRestore(repository, stores);

    const result = stores.resultStore.computeRound({
      roundNumber: 1,
      draws: activeDraws(stores),
      ballots: stores.ballotStore.listForRound(1),
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      now: "computed",
    });
    stores.votingWindowStore.setResultsPhase(1, "results_revealed");
    stores = await persistAndRestore(repository, stores);

    expect(stores.ballotStore.listForRound(1)).toHaveLength(1);
    expect(stores.resultStore.getRoundResult(1)?.id).toBe(result.id);
    expect(
      stores.votingWindowStore.getSnapshot({
        roundNumber: 1,
        drawnSetCount: 2,
        eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
        submittedPlayerIds: stores.ballotStore.listForRound(1).map((ballot) => ballot.playerId),
      }).status,
    ).toBe("results_revealed");
  });

  it("restores 100 player ballots with latest revisions through the repository", async () => {
    const repository = new MemoryOperationalStateRepository();
    let stores = createAdminStateStores();
    const players = Array.from({ length: 100 }, (_, index) =>
      stores.rosterStore.createOrUpdatePlayer({
        startggUsername: `Player ${index.toString().padStart(3, "0")}`,
        active: true,
        now: "roster",
      }),
    );

    stores.drawStateStore.setChartsForTest(testCharts());
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });
    stores.votingWindowStore.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      nowMs: 0,
    });

    const draws = activeDraws(stores);

    for (const player of players) {
      stores.ballotStore.submit(
        {
          roundNumber: 1,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
          choices: [choice(draws[0], [draws[0].charts[0]?.id ?? ""]), choice(draws[1], [])],
        },
        draws,
        "first",
      );
      stores.ballotStore.submit(
        {
          roundNumber: 1,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
          choices: [choice(draws[0], []), choice(draws[1], [draws[1].charts[0]?.id ?? ""])],
        },
        draws,
        "edit",
      );
    }

    stores = await persistAndRestore(repository, stores);

    const snapshot = stores.votingWindowStore.getSnapshot({
      roundNumber: 1,
      drawnSetCount: 2,
      eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
      submittedPlayerIds: stores.ballotStore.listForRound(1).map((ballot) => ballot.playerId),
      nowMs: 5_000,
    });

    expect(stores.rosterStore.listEligiblePlayersForRound(1)).toHaveLength(100);
    expect(stores.ballotStore.listForRound(1)).toHaveLength(100);
    expect(stores.ballotStore.listForRound(1).every((ballot) => ballot.revision === 2)).toBe(true);
    expect(snapshot.status).toBe("final_30_seconds");
  });

  it("completes a four-round persistent rehearsal with final CSV exports", async () => {
    const repository = new MemoryOperationalStateRepository();
    const charts = fourRoundRehearsalCharts();
    let stores = createDeterministicStores();
    const players = ["Alpha", "Bravo", "Charlie", "Delta"].map((startggUsername) =>
      stores.rosterStore.createOrUpdatePlayer({ startggUsername, active: true, now: "roster" }),
    );
    const selectedPriorSongKeys = new Set<string>();
    const csvByRound = new Map<number, string>();

    stores.drawStateStore.setChartsForTest(charts);
    stores.hostLockStore.acquire("session-a", "host-token-a", 0);
    stores.roundStateStore.setRehearsalMode(true);
    stores = await persistAndRestore(repository, stores, createDeterministicStores);

    for (const roundNumber of [1, 2, 3, 4] as const) {
      stores.drawStateStore.setChartsForTest(charts);
      stores.roundStateStore.setCurrentRound(roundNumber);
      stores.drawStateStore.drawRoundSet({ roundNumber, setOrder: 1 });
      stores.drawStateStore.drawRoundSet({ roundNumber, setOrder: 2 });

      const draws = activeDraws(stores, roundNumber);
      const drawnSongKeys = draws.flatMap((draw) => draw.charts.map((chart) => chart.songKey));

      expect(drawnSongKeys.some((songKey) => selectedPriorSongKeys.has(songKey))).toBe(false);
      expect(new Set(drawnSongKeys).size).toBe(drawnSongKeys.length);

      stores.votingWindowStore.openVoting({
        roundNumber,
        drawsReady: true,
        eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(roundNumber),
        nowMs: roundNumber * 100_000,
      });

      stores.ballotStore.submit(
        {
          roundNumber,
          playerId: players[0]?.id ?? "",
          playerStartggUsername: players[0]?.startggUsername ?? "",
          choices: [choice(draws[0], [draws[0].charts[0]?.id ?? ""]), choice(draws[1], [])],
        },
        draws,
        `round-${roundNumber}-first-submit`,
      );
      stores.ballotStore.submit(
        {
          roundNumber,
          playerId: players[0]?.id ?? "",
          playerStartggUsername: players[0]?.startggUsername ?? "",
          choices: [choice(draws[0], []), choice(draws[1], [draws[1].charts[0]?.id ?? ""])],
        },
        draws,
        `round-${roundNumber}-edited-submit`,
      );

      stores.votingWindowStore.closeVoting(roundNumber, roundNumber * 100_000 + 10_000);
      stores.ballotStore.submit(
        {
          roundNumber,
          playerId: players[1]?.id ?? "",
          playerStartggUsername: players[1]?.startggUsername ?? "",
          choices: [choice(draws[0], []), choice(draws[1], [])],
        },
        draws,
        `round-${roundNumber}-manual-submit`,
        {
          source: "manual_admin",
          manualOverride: true,
          manualReason: `round ${roundNumber} rehearsal override`,
        },
      );

      stores.resultStore.computeRound({
        roundNumber,
        draws,
        ballots: stores.ballotStore.listForRound(roundNumber),
        eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(roundNumber),
        now: `round-${roundNumber}-computed`,
      });
      stores.votingWindowStore.setResultsPhase(roundNumber, "results_computed");
      revealFinal(stores, roundNumber);
      stores.votingWindowStore.setResultsPhase(roundNumber, "results_revealed");

      const result = stores.resultStore.getRoundResult(roundNumber);

      if (!result) {
        throw new Error(`Expected Round ${roundNumber} result.`);
      }

      expect(result.revealPhase).toBe("final");
      expect(result.finalRevealedAt).not.toBeNull();
      expect(result.sets).toHaveLength(2);

      for (const set of result.sets) {
        selectedPriorSongKeys.add(set.selectedChart.songKey);
      }

      const csv = generatePrivateBallotCsv({
        result,
        ballots: stores.ballotStore.listForRound(roundNumber),
      });

      expect(csv).toContain(`round_number,player_startgg_username`);
      expect(csv).toContain(`round ${roundNumber} rehearsal override`);
      expect(csv).toContain("true,shared_admin");
      csvByRound.set(roundNumber, csv);

      stores = await persistAndRestore(repository, stores, createDeterministicStores);
      expect(stores.resultStore.getRoundResult(roundNumber)?.revealPhase).toBe("final");
      expect(stores.ballotStore.listForRound(roundNumber)).toHaveLength(2);
    }

    expect(selectedPriorSongKeys.size).toBe(8);
    expect(csvByRound.size).toBe(4);
    expect(stores.roundStateStore.getSnapshot()).toEqual({
      currentRound: 4,
      rehearsalMode: true,
    });
  });
});
