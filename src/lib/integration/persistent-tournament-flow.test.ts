import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
  type AdminStateStores,
} from "@/lib/persistence/operational-state";
import { MemoryOperationalStateRepository } from "@/lib/persistence/repository";

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
) {
  await repository.save(createOperationalStateSnapshot(stores, "saved"));

  const snapshot = await repository.load();

  if (!snapshot) {
    throw new Error("Expected repository snapshot.");
  }

  const restored = createAdminStateStores();
  restoreOperationalStateSnapshot(restored, snapshot);

  return restored;
}

function activeDraws(stores: AdminStateStores) {
  const first = stores.drawStateStore.getActiveDraw(1, 1);
  const second = stores.drawStateStore.getActiveDraw(1, 2);

  if (!first || !second) {
    throw new Error("Expected both Round 1 draws.");
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
});
