import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import type { DrawRecord } from "@/lib/draw/draw-state";
import {
  cloneOperationalStateSnapshot,
  createAdminStateStores,
  createOperationalStateSnapshot,
  type AdminStateStores,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { MemoryOperationalStateRepository } from "@/lib/persistence/repository";
import type { OperationalStateRepository } from "@/lib/persistence/repository";
import {
  getOperationalStateRepository,
  getTournamentStateBackend,
  hydrateTournamentState,
  persistTournamentState,
  withPersistedResultAdminState,
  withPersistedTournamentState,
  withPersistedVotingAdminState,
} from "./persistence";

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

function choice(draw: DrawRecord, bannedChartIds: string[]) {
  return {
    drawId: draw.id,
    roundSetId: draw.roundSetId,
    displayLabel: draw.displayLabel,
    noBans: bannedChartIds.length === 0,
    bannedChartIds,
  };
}

async function seedOpenVotingRound(repository: MemoryOperationalStateRepository) {
  const stores = createAdminStateStores();

  stores.drawStateStore.setChartsForTest([
    ...chartsFor("16", 10, "S16"),
    ...chartsFor("17", 30, "S17"),
  ]);

  const players = ["Alpha", "Bravo"].map((startggUsername) =>
    stores.rosterStore.createOrUpdatePlayer({
      startggUsername,
      active: true,
      now: "2026-06-30T00:00:00.000Z",
    }),
  );
  const firstDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
  const secondDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });

  stores.votingWindowStore.openVoting({
    roundNumber: 1,
    drawsReady: true,
    eligiblePlayers: stores.rosterStore.listEligiblePlayersForRound(1),
    nowMs: Date.parse("2026-06-30T00:00:00.000Z"),
  });

  await repository.save(createOperationalStateSnapshot(stores, "2026-06-30T00:00:00.000Z"));

  return {
    players,
    draws: [firstDraw, secondDraw] as const,
  };
}

function seedAtomicTransitionState() {
  const stores = createAdminStateStores();

  stores.drawStateStore.setChartsForTest([
    ...chartsFor("16", 10, "Atomic S16"),
    ...chartsFor("17", 30, "Atomic S17"),
  ]);

  const player = stores.rosterStore.createOrUpdatePlayer({
    startggUsername: "Atomic Player",
    active: true,
    now: "2026-07-13T00:00:00.000Z",
  });
  const firstDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 1 });
  const secondDraw = stores.drawStateStore.drawRoundSet({ roundNumber: 1, setOrder: 2 });

  stores.votingWindowStore.openVoting({
    roundNumber: 1,
    drawsReady: true,
    eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
    nowMs: Date.parse("2026-07-13T00:00:00.000Z"),
  });
  stores.votingWindowStore.closeVoting(1, Date.parse("2026-07-13T00:10:00.000Z"));
  stores.resultStore.computeRound({
    roundNumber: 1,
    draws: [firstDraw, secondDraw],
    ballots: [],
    eligiblePlayers: [{ id: player.id, startggUsername: player.startggUsername }],
    priorSelectedSongBlocks: [],
    now: "2026-07-13T00:10:01.000Z",
  });
  stores.votingWindowStore.setResultsPhase(1, "results_computed");
  stores.ballotStore.setPhoneStatus(1, { phase: "closed_revealing" });

  return stores;
}

function advanceTestPublicStateGeneration(
  stores: AdminStateStores,
  transitionKind: string,
  updatedAt: string,
) {
  const { generation: expectedGeneration, ...previous } =
    stores.publicStateGenerationStore.getRound(1);
  const result = stores.resultStore.getRoundResult(1);
  const votingWindow = stores.votingWindowStore
    .exportSnapshot()
    .windows.find((window) => window.roundNumber === 1);
  const phoneReleased = stores.ballotStore.getPhoneStatus(1).phase === "revealed";

  return stores.publicStateGenerationStore.advance({
    ...previous,
    expectedGeneration,
    transitionKind,
    resultMode: Boolean(result),
    updatedAt,
    activeDraws: stores.drawStateStore
      .getRoundDraws(1)
      .filter((draw): draw is NonNullable<typeof draw> => draw !== null)
      .map((draw) => ({
        drawId: draw.id,
        roundSetId: draw.roundSetId,
        version: draw.version,
      })),
    votingStatus: votingWindow?.status ?? "ready_to_vote",
    votingDeadline: votingWindow?.closesAt ?? null,
    resultId: result?.id ?? null,
    resultPhase: result?.revealPhase ?? null,
    resultPhaseStartedAt: result?.revealPhaseStartedAt ?? null,
    tiebreakStarts:
      result?.sets.flatMap((set) =>
        set.winnerRevealStartedAt
          ? [{ setOrder: set.setOrder, startedAt: set.winnerRevealStartedAt }]
          : [],
      ) ?? [],
    phoneReleaseStatus: phoneReleased ? "released" : "held",
    phoneReleasedAt: phoneReleased ? updatedAt : null,
  });
}

function failingSaveRepository(snapshot: OperationalStateSnapshot): OperationalStateRepository {
  return {
    async load() {
      return cloneOperationalStateSnapshot(snapshot);
    },
    async save() {
      throw new Error("atomic save failed");
    },
  };
}

describe("server persistence safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects memory or missing tournament state backend in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND", "true");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    expect(getTournamentStateBackend()).toBe("supabase");
  });

  it("rejects memory or missing tournament state backend in Vercel production semantics", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "memory");
    expect(() => getTournamentStateBackend()).toThrow(/supabase/);

    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    expect(getTournamentStateBackend()).toBe("supabase");
  });

  it("requires an event id before initializing Supabase-backed runtime persistence", () => {
    vi.stubEnv("TOURNAMENT_STATE_BACKEND", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
    vi.stubEnv("ADMIN_PASSWORD_HASH", "$2a$10$test");
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    vi.stubEnv("TOURNAMENT_EVENT_ID", "");

    expect(() => getOperationalStateRepository()).toThrow(/TOURNAMENT_EVENT_ID/);

    vi.stubEnv("TOURNAMENT_EVENT_ID", "test-event");

    expect(() => getOperationalStateRepository()).not.toThrow();
  });

  it("restores the previous in-process state when persistence fails", async () => {
    const stores = createAdminStateStores();
    const repository: OperationalStateRepository = {
      async load() {
        return null;
      },
      async save() {
        throw new Error("save failed");
      },
    };

    stores.rosterStore.createOrUpdatePlayer({ startggUsername: "Existing", active: true });

    await expect(
      withPersistedTournamentState(
        () => {
          stores.rosterStore.createOrUpdatePlayer({ startggUsername: "Rolled Back", active: true });
        },
        stores,
        repository,
      ),
    ).rejects.toThrow("save failed");

    expect(stores.rosterStore.listPlayers().map((player) => player.startggUsername)).toEqual([
      "Existing",
    ]);
  });

  it("rolls back a reroll and its generation when the atomic memory save fails", async () => {
    const stores = seedAtomicTransitionState();
    const baseline = createOperationalStateSnapshot(stores, "2026-07-13T00:10:01.000Z");
    const originalDraw = stores.drawStateStore.getActiveDraw(1, 1);
    const originalHistoryCount = stores.drawStateStore.getRoundDraws(1).filter(Boolean).length;

    await expect(
      withPersistedVotingAdminState(
        () => {
          stores.drawStateStore.rerollOneChart({
            roundNumber: 1,
            setOrder: 1,
            chartId: originalDraw?.charts[0]?.id ?? "",
            reason: "atomic rollback test",
          });
          stores.resultStore.clearRoundResult(1);
          stores.votingWindowStore.resetRound(1);
          stores.ballotStore.setPhoneStatus(1, { phase: "voting_open" });
          advanceTestPublicStateGeneration(stores, "reroll_one_chart", "2026-07-13T00:10:02.000Z");
        },
        stores,
        failingSaveRepository(baseline),
      ),
    ).rejects.toThrow("atomic save failed");

    expect(stores.drawStateStore.getActiveDraw(1, 1)?.id).toBe(originalDraw?.id);
    expect(stores.drawStateStore.getRoundDraws(1).filter(Boolean)).toHaveLength(
      originalHistoryCount,
    );
    expect(stores.resultStore.getRoundResult(1)?.revealPhase).toBe("computed");
    expect(stores.ballotStore.getPhoneStatus(1)).toEqual({ phase: "closed_revealing" });
    expect(stores.publicStateGenerationStore.getRound(1).generation).toBe(0);
  });

  it("rolls back reveal progress and generation when the atomic memory save fails", async () => {
    const stores = seedAtomicTransitionState();
    const baseline = createOperationalStateSnapshot(stores, "2026-07-13T00:10:01.000Z");

    await expect(
      withPersistedResultAdminState(
        () => {
          stores.resultStore.advanceReveal(1, "2026-07-13T00:10:02.000Z", "computed");
          stores.votingWindowStore.setResultsPhase(1, "results_revealing");
          advanceTestPublicStateGeneration(
            stores,
            "result_reveal_advanced",
            "2026-07-13T00:10:02.000Z",
          );
        },
        stores,
        failingSaveRepository(baseline),
      ),
    ).rejects.toThrow("atomic save failed");

    expect(stores.resultStore.getRoundResult(1)?.revealPhase).toBe("computed");
    expect(stores.votingWindowStore.exportSnapshot().windows[0]?.status).toBe("results_computed");
    expect(stores.ballotStore.getPhoneStatus(1)).toEqual({ phase: "closed_revealing" });
    expect(stores.publicStateGenerationStore.getRound(1).generation).toBe(0);
  });

  it("rolls back phone release and generation when the atomic memory save fails", async () => {
    const stores = seedAtomicTransitionState();

    stores.resultStore.setRevealPhase(1, "final", "2026-07-13T00:10:02.000Z");
    stores.votingWindowStore.setResultsPhase(1, "results_revealing");

    const baseline = createOperationalStateSnapshot(stores, "2026-07-13T00:10:02.000Z");
    const result = stores.resultStore.getRoundResult(1);

    await expect(
      withPersistedResultAdminState(
        () => {
          stores.votingWindowStore.setResultsPhase(1, "results_revealed");
          stores.ballotStore.setPhoneStatus(1, {
            phase: "revealed",
            selectedCharts:
              result?.sets.map((set) => ({
                id: set.selectedChart.id,
                name: set.selectedChart.name,
                artist: set.selectedChart.artist,
                displayDifficulty: set.selectedChart.displayDifficulty,
                localImagePath: set.selectedChart.localImagePath,
              })) ?? [],
          });
          advanceTestPublicStateGeneration(stores, "results_released", "2026-07-13T00:10:03.000Z");
        },
        stores,
        failingSaveRepository(baseline),
      ),
    ).rejects.toThrow("atomic save failed");

    expect(stores.resultStore.getRoundResult(1)?.revealPhase).toBe("final");
    expect(stores.votingWindowStore.exportSnapshot().windows[0]?.status).toBe("results_revealing");
    expect(stores.ballotStore.getPhoneStatus(1)).toEqual({ phase: "closed_revealing" });
    expect(stores.publicStateGenerationStore.getRound(1).generation).toBe(0);
  });

  it("merges concurrent different-player ballot submissions instead of overwriting stale snapshots", async () => {
    const repository = new MemoryOperationalStateRepository();
    const { players } = await seedOpenVotingRound(repository);
    const firstWriter = createAdminStateStores();
    const secondWriter = createAdminStateStores();

    await hydrateTournamentState(firstWriter, repository);
    await hydrateTournamentState(secondWriter, repository);

    const firstDraws = [
      firstWriter.drawStateStore.getActiveDraw(1, 1),
      firstWriter.drawStateStore.getActiveDraw(1, 2),
    ] as DrawRecord[];
    const secondDraws = [
      secondWriter.drawStateStore.getActiveDraw(1, 1),
      secondWriter.drawStateStore.getActiveDraw(1, 2),
    ] as DrawRecord[];

    firstWriter.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
        choices: [choice(firstDraws[0] as DrawRecord, []), choice(firstDraws[1] as DrawRecord, [])],
      },
      firstDraws,
      "2026-06-30T00:01:00.000Z",
    );
    secondWriter.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: players[1]?.id ?? "",
        playerStartggUsername: players[1]?.startggUsername ?? "",
        choices: [
          choice(secondDraws[0] as DrawRecord, [secondDraws[0]?.charts[0]?.id ?? ""]),
          choice(secondDraws[1] as DrawRecord, []),
        ],
      },
      secondDraws,
      "2026-06-30T00:01:01.000Z",
    );

    await persistTournamentState(firstWriter, repository);
    await persistTournamentState(secondWriter, repository);

    const restored = createAdminStateStores();

    await hydrateTournamentState(restored, repository);

    expect(
      restored.ballotStore
        .listForRound(1)
        .map((ballot) => ballot.playerId)
        .sort(),
    ).toEqual(players.map((player) => player.id).sort());
  });

  it("preserves the latest valid same-player ballot edit during concurrent saves", async () => {
    const repository = new MemoryOperationalStateRepository();
    const { players } = await seedOpenVotingRound(repository);
    const earlierWriter = createAdminStateStores();
    const laterWriter = createAdminStateStores();

    await hydrateTournamentState(earlierWriter, repository);
    await hydrateTournamentState(laterWriter, repository);

    const earlierDraws = [
      earlierWriter.drawStateStore.getActiveDraw(1, 1),
      earlierWriter.drawStateStore.getActiveDraw(1, 2),
    ] as DrawRecord[];
    const laterDraws = [
      laterWriter.drawStateStore.getActiveDraw(1, 1),
      laterWriter.drawStateStore.getActiveDraw(1, 2),
    ] as DrawRecord[];

    earlierWriter.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
        choices: [
          choice(earlierDraws[0] as DrawRecord, [earlierDraws[0]?.charts[0]?.id ?? ""]),
          choice(earlierDraws[1] as DrawRecord, []),
        ],
      },
      earlierDraws,
      "2026-06-30T00:01:00.000Z",
    );
    laterWriter.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
        choices: [
          choice(laterDraws[0] as DrawRecord, []),
          choice(laterDraws[1] as DrawRecord, [laterDraws[1]?.charts[0]?.id ?? ""]),
        ],
      },
      laterDraws,
      "2026-06-30T00:01:05.000Z",
    );

    await persistTournamentState(laterWriter, repository);
    await persistTournamentState(earlierWriter, repository);

    const restored = createAdminStateStores();

    await hydrateTournamentState(restored, repository);

    const ballot = restored.ballotStore.get(1, players[0]?.id ?? "");

    expect(ballot?.submittedAt).toBe("2026-06-30T00:01:05.000Z");
    expect(ballot?.choices[0]?.noBans).toBe(true);
    expect(ballot?.choices[1]?.bannedChartIds).toEqual([laterDraws[1]?.charts[0]?.id]);
  });

  it("keeps ballot writes when a stale host heartbeat saves afterward", async () => {
    const repository = new MemoryOperationalStateRepository();
    const { players } = await seedOpenVotingRound(repository);
    const heartbeatWriter = createAdminStateStores();
    const ballotWriter = createAdminStateStores();

    await hydrateTournamentState(heartbeatWriter, repository);
    heartbeatWriter.hostLockStore.acquire("session-a", "host-token-a", 0);
    await persistTournamentState(heartbeatWriter, repository);

    await hydrateTournamentState(heartbeatWriter, repository);
    await hydrateTournamentState(ballotWriter, repository);

    expect(heartbeatWriter.hostLockStore.refresh("session-a", "host-token-a", 1_000)).toBe(true);

    const draws = [
      ballotWriter.drawStateStore.getActiveDraw(1, 1),
      ballotWriter.drawStateStore.getActiveDraw(1, 2),
    ] as DrawRecord[];

    ballotWriter.ballotStore.submit(
      {
        roundNumber: 1,
        playerId: players[0]?.id ?? "",
        playerStartggUsername: players[0]?.startggUsername ?? "",
        choices: [choice(draws[0] as DrawRecord, []), choice(draws[1] as DrawRecord, [])],
      },
      draws,
      "2026-06-30T00:02:00.000Z",
    );

    await persistTournamentState(ballotWriter, repository);
    await persistTournamentState(heartbeatWriter, repository);

    const restored = createAdminStateStores();

    await hydrateTournamentState(restored, repository);

    expect(restored.ballotStore.listForRound(1)).toHaveLength(1);
    expect(restored.hostLockStore.getSnapshot("session-a", 1_001)).toMatchObject({
      status: "active",
      heartbeatAt: 1_000,
    });
  });

  it("does not let a stale host heartbeat overwrite a newer host takeover", async () => {
    const repository = new MemoryOperationalStateRepository();
    await seedOpenVotingRound(repository);
    const initialHost = createAdminStateStores();
    const heartbeatWriter = createAdminStateStores();
    const takeoverWriter = createAdminStateStores();

    await hydrateTournamentState(initialHost, repository);
    initialHost.hostLockStore.acquire("session-a", "host-token-a", 0);
    await persistTournamentState(initialHost, repository);

    await hydrateTournamentState(heartbeatWriter, repository);
    await hydrateTournamentState(takeoverWriter, repository);

    expect(heartbeatWriter.hostLockStore.refresh("session-a", "host-token-a", 1_000)).toBe(true);
    takeoverWriter.hostLockStore.acquire("session-b", "host-token-b", 1_200, { force: true });

    await persistTournamentState(takeoverWriter, repository);
    await persistTournamentState(heartbeatWriter, repository);

    const restored = createAdminStateStores();

    await hydrateTournamentState(restored, repository);

    expect(restored.hostLockStore.getSnapshot("session-b", 1_201)).toMatchObject({
      status: "active",
      ownerSessionId: "session-b",
      heartbeatAt: 1_200,
    });
  });

  it("keeps a two-session host takeover after delayed stale heartbeat and release saves", async () => {
    const repository = new MemoryOperationalStateRepository();
    await seedOpenVotingRound(repository);
    const initialHost = createAdminStateStores();
    const staleHeartbeatWriter = createAdminStateStores();
    const staleReleaseWriter = createAdminStateStores();
    const takeoverWriter = createAdminStateStores();

    await hydrateTournamentState(initialHost, repository);
    initialHost.hostLockStore.acquire("session-a", "host-token-a", 0);
    await persistTournamentState(initialHost, repository);

    await hydrateTournamentState(staleHeartbeatWriter, repository);
    await hydrateTournamentState(staleReleaseWriter, repository);
    await hydrateTournamentState(takeoverWriter, repository);

    expect(staleHeartbeatWriter.hostLockStore.refresh("session-a", "host-token-a", 1_000)).toBe(
      true,
    );
    expect(
      staleReleaseWriter.hostLockStore.release("session-a", "host-token-a", 1_100),
    ).toMatchObject({
      released: true,
      outcome: "released",
    });
    takeoverWriter.hostLockStore.acquire("session-b", "host-token-b", 1_200, { force: true });

    await persistTournamentState(takeoverWriter, repository);
    await persistTournamentState(staleHeartbeatWriter, repository);
    await persistTournamentState(staleReleaseWriter, repository);

    const restored = createAdminStateStores();

    await hydrateTournamentState(restored, repository);

    expect(restored.hostLockStore.getSnapshot("session-b", 1_201)).toMatchObject({
      status: "active",
      ownerSessionId: "session-b",
      heartbeatAt: 1_200,
    });
    expect(restored.hostLockStore.getSnapshot("session-a", 1_201)).toMatchObject({
      status: "readonly",
      ownerSessionId: "session-b",
      heartbeatAt: 1_200,
    });
  });
});
