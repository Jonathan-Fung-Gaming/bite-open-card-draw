import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type { RoundResultSnapshot } from "@/lib/results/result-engine";
import { MemoryOperationalStateRepository } from "./repository";
import {
  createAdminStateStores,
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
} from "./operational-state";

function chartsFor(level: string, count: number, startRow: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    normalizeChartRow(
      {
        name: `${prefix} ${index}`,
        name_kr: `${prefix} ${index}`,
        artist: "Artist",
        label: "test",
        type: "s",
        level,
        bg_img: "",
      },
      startRow + index,
    ),
  );
}

function restoreFromRepository(
  stores: ReturnType<typeof createAdminStateStores>,
  repository: MemoryOperationalStateRepository,
) {
  return repository.load().then((snapshot) => {
    if (!snapshot) {
      throw new Error("Expected persisted snapshot.");
    }

    restoreOperationalStateSnapshot(stores, snapshot);
  });
}

function resultChart(id: string, songKey: string): DrawnChartSummary {
  return {
    id,
    name: id,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey,
    chartKey: `${songKey}:s16`,
    sourceBgImg: "",
    localImagePath: null,
  };
}

function finalResult(songKey: string): RoundResultSnapshot {
  const first = resultChart("selected-1", songKey);
  const second = resultChart("selected-2", "other-song");

  return {
    id: "result-1",
    roundNumber: 1,
    computedAt: "computed",
    eligiblePlayers: [],
    revealPhase: "final",
    revealPhaseStartedAt: "final",
    finalRevealedAt: "final",
    sets: [
      {
        drawId: "draw-1",
        drawVersion: 1,
        roundSetId: "static-s16",
        setOrder: 1,
        displayLabel: "S16",
        rows: [{ chart: first, banCount: 0, selected: true, tiedForFewest: false }],
        maxBanCount: 0,
        leastBanCount: 0,
        selectedChart: first,
        tiebreakUsed: false,
        tiebreakCandidateIds: [],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
      {
        drawId: "draw-2",
        drawVersion: 1,
        roundSetId: "static-s17",
        setOrder: 2,
        displayLabel: "S17",
        rows: [{ chart: second, banCount: 0, selected: true, tiedForFewest: false }],
        maxBanCount: 0,
        leastBanCount: 0,
        selectedChart: second,
        tiebreakUsed: false,
        tiebreakCandidateIds: [],
        tiebreakWinnerChartId: null,
        wheelSlots: [],
        wheelSupported: false,
        winnerRevealStartedAt: null,
      },
    ],
  };
}

describe("operational state persistence", () => {
  it("restores roster, host lock, draws, voting windows, and ballots after store recreation", async () => {
    const repository = new MemoryOperationalStateRepository();
    const first = createAdminStateStores();
    const player = first.rosterStore.createOrUpdatePlayer({
      startggUsername: "Alpha",
      active: true,
      now: "roster",
    });

    first.hostLockStore.acquire("session-a", "host-token-a", 0);
    first.drawStateStore.setChartsForTest([
      ...chartsFor("16", 8, 10, "S16"),
      ...chartsFor("17", 8, 30, "S17"),
    ]);
    const firstDraw = first.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    const secondDraw = first.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });

    first.votingWindowStore.openVoting({
      roundNumber: 1,
      drawsReady: true,
      eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
      nowMs: 0,
    });
    first.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: player.id,
        playerStartggUsername: player.startggUsername,
        choices: [
          {
            drawId: firstDraw.id,
            roundSetId: firstDraw.roundSetId,
            displayLabel: firstDraw.displayLabel,
            noBans: true,
            bannedChartIds: [],
          },
          {
            drawId: secondDraw.id,
            roundSetId: secondDraw.roundSetId,
            displayLabel: secondDraw.displayLabel,
            noBans: true,
            bannedChartIds: [],
          },
        ],
      },
      [firstDraw, secondDraw],
      "submitted",
    );

    await repository.save(createOperationalStateSnapshot(first, "saved"));

    const recreated = createAdminStateStores();
    await restoreFromRepository(recreated, repository);

    expect(recreated.rosterStore.listPlayers()).toHaveLength(1);
    expect(recreated.hostLockStore.getSnapshot("session-a", 1_000).status).toBe("active");
    expect(recreated.drawStateStore.getActiveDraw(1, 1)?.charts).toHaveLength(7);
    expect(recreated.votingWindowStore.getSnapshot({
      roundNumber: 1,
      drawnSetCount: 2,
      eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
      submittedPlayerIds: [player.id],
      nowMs: 1_000,
    }).status).toBe("final_30_seconds");
    expect(recreated.ballotStore.get(1, player.id)?.submittedAt).toBe("submitted");
  });

  it("lets two independent store containers read and write the same persisted state", async () => {
    const repository = new MemoryOperationalStateRepository();
    const first = createAdminStateStores();
    const player = first.rosterStore.createOrUpdatePlayer({ startggUsername: "Alpha" });

    await repository.save(createOperationalStateSnapshot(first, "first-save"));

    const second = createAdminStateStores();
    await restoreFromRepository(second, repository);
    second.rosterStore.setPlayerActiveStatus(player.id, false, "second-save");
    await repository.save(createOperationalStateSnapshot(second, "second-save"));

    await restoreFromRepository(first, repository);

    expect(first.rosterStore.getPlayer(player.id)?.active).toBe(false);
  });

  it("derives selected prior songs from persisted final results on restore", async () => {
    const repository = new MemoryOperationalStateRepository();
    const first = createAdminStateStores();

    first.drawStateStore.markSelectedSong("stale-memory-only");
    first.resultStore.importSnapshot({ results: [finalResult("persisted-selected-song")] });
    await repository.save(createOperationalStateSnapshot(first, "saved"));

    const recreated = createAdminStateStores();
    await restoreFromRepository(recreated, repository);

    expect(recreated.drawStateStore.exportSnapshot().selectedSongKeys).toEqual([
      "other-song",
      "persisted-selected-song",
    ]);
  });

  it("restores chart exclusion reasons from persisted draw state", async () => {
    const repository = new MemoryOperationalStateRepository();
    const first = createAdminStateStores();
    const [target] = chartsFor("16", 8, 50, "S16");

    first.drawStateStore.setChartsForTest(chartsFor("16", 8, 50, "S16"));
    first.drawStateStore.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: true,
      reason: "event rule exclusion",
    });
    await repository.save(createOperationalStateSnapshot(first, "saved"));

    const recreated = createAdminStateStores();
    await restoreFromRepository(recreated, repository);

    expect(recreated.drawStateStore.getChartExclusions()).toEqual([
      expect.objectContaining({
        chartKey: target?.chartKey,
        excluded: true,
        reason: "event rule exclusion",
      }),
    ]);
  });
});
