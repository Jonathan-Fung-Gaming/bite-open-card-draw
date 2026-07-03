import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { MemoryOperationalStateRepository } from "@/lib/persistence/repository";
import { resetTournamentOperationalState, adminState } from "@/lib/server/admin-state";
import {
  hydrateTournamentState,
  getOperationalStateRepository,
  persistTournamentState,
} from "@/lib/server/persistence";
import { ONE_MINUTE_MS, TEN_MINUTES_MS, FINAL_CHANGE_MS } from "@/lib/vote/voting-window";
import {
  advanceVotingTimerIfDue,
  getVotingRoundSnapshot,
  isVotingTimerAdvancementDue,
} from "./voting-round";

vi.mock("server-only", () => ({}));

function chartsFor(level: string, startRow: number, prefix: string) {
  return Array.from({ length: 8 }, (_, index) =>
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

function memoryRepository() {
  const repository = getOperationalStateRepository();

  if (!(repository instanceof MemoryOperationalStateRepository)) {
    throw new Error("Expected memory repository for voting-round tests.");
  }

  return repository;
}

function seedOpenRound(playerCount = 4) {
  adminState.drawStateStore.setChartsForTest([
    ...chartsFor("16", 10, "S16"),
    ...chartsFor("17", 30, "S17"),
  ]);

  const players = Array.from({ length: playerCount }, (_, index) =>
    adminState.rosterStore.createOrUpdatePlayer({
      startggUsername: `Player ${index + 1}`,
      active: true,
      now: "1970-01-01T00:00:00.000Z",
    }),
  );
  const firstDraw = adminState.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
  const secondDraw = adminState.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });

  adminState.votingWindowStore.openVoting({
    roundNumber: 1,
    drawsReady: true,
    eligiblePlayers: adminState.rosterStore.listEligiblePlayersForRound(1),
    nowMs: 0,
  });

  return {
    players,
    draws: [firstDraw, secondDraw] as const,
  };
}

function submitNoBanBallot(player: { id: string; startggUsername: string }, draws: DrawRecord[]) {
  adminState.ballotStore.submit(
    {
      roundNumber: 1,
      playerId: player.id,
      playerStartggUsername: player.startggUsername,
      choices: draws.map((draw) => ({
        drawId: draw.id,
        roundSetId: draw.roundSetId,
        displayLabel: draw.displayLabel,
        noBans: true,
        bannedChartIds: [],
      })),
    },
    draws,
    "1970-01-01T00:00:05.000Z",
  );
}

async function persistAndReload() {
  await persistTournamentState();
  resetTournamentOperationalState();
  await hydrateTournamentState();
}

describe("server voting-round timer advancement", () => {
  beforeEach(() => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    resetTournamentOperationalState();
    memoryRepository().clear();
  });

  afterEach(() => {
    resetTournamentOperationalState();
    memoryRepository().clear();
    vi.unstubAllEnvs();
  });

  it("does not persist anything before a timer transition is due", async () => {
    seedOpenRound();
    await persistAndReload();

    const before = await memoryRepository().load();

    expect(isVotingTimerAdvancementDue(1, 1_000)).toBe(false);
    await expect(advanceVotingTimerIfDue(1, 1_000)).resolves.toBe(false);

    expect(await memoryRepository().load()).toEqual(before);
  });

  it("persists extension and closed states when polling after deadlines", async () => {
    seedOpenRound();
    await persistAndReload();

    await expect(advanceVotingTimerIfDue(1, TEN_MINUTES_MS)).resolves.toBe(true);

    resetTournamentOperationalState();
    await hydrateTournamentState();

    expect(getVotingRoundSnapshot(1, TEN_MINUTES_MS)).toMatchObject({
      status: "extension_1_minute",
      extensionUsed: true,
      remainingMs: ONE_MINUTE_MS,
    });

    const beforeExtensionDeadline = await memoryRepository().load();

    await expect(advanceVotingTimerIfDue(1, TEN_MINUTES_MS + 1_000)).resolves.toBe(false);
    expect(await memoryRepository().load()).toEqual(beforeExtensionDeadline);

    await expect(advanceVotingTimerIfDue(1, TEN_MINUTES_MS + ONE_MINUTE_MS)).resolves.toBe(true);

    resetTournamentOperationalState();
    await hydrateTournamentState();

    expect(getVotingRoundSnapshot(1, TEN_MINUTES_MS + ONE_MINUTE_MS)).toMatchObject({
      status: "voting_closed",
      canSubmit: false,
      closedAt: new Date(TEN_MINUTES_MS + ONE_MINUTE_MS).toISOString(),
    });
  });

  it("persists all-submitted final-change warning from polling", async () => {
    const { players, draws } = seedOpenRound(2);

    players.forEach((player) => submitNoBanBallot(player, [...draws]));
    await persistAndReload();

    await expect(advanceVotingTimerIfDue(1, 5_000)).resolves.toBe(true);

    resetTournamentOperationalState();
    await hydrateTournamentState();

    expect(getVotingRoundSnapshot(1, 5_000)).toMatchObject({
      status: "final_30_seconds",
      canSubmit: true,
      remainingMs: FINAL_CHANGE_MS,
      finalWarningStartedAt: new Date(5_000).toISOString(),
    });
  });

  it("does not advance paused voting windows from polling", async () => {
    seedOpenRound();
    adminState.votingWindowStore.pauseVoting(1, 2 * 60 * 1000);
    await persistAndReload();

    const before = await memoryRepository().load();

    await expect(advanceVotingTimerIfDue(1, TEN_MINUTES_MS + ONE_MINUTE_MS)).resolves.toBe(false);

    expect(await memoryRepository().load()).toEqual(before);
    expect(getVotingRoundSnapshot(1, TEN_MINUTES_MS + ONE_MINUTE_MS)).toMatchObject({
      status: "voting_paused",
      canSubmit: false,
      remainingMs: 8 * 60 * 1000,
    });
  });
});
