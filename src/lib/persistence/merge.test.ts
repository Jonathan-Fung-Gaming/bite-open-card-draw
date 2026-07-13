import { describe, expect, it } from "vitest";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import type {
  ResultRevealPhase,
  ResultSetSnapshot,
  RoundResultSnapshot,
} from "@/lib/results/result-engine";
import { createAdminStateStores, createOperationalStateSnapshot } from "./operational-state";
import { mergeOperationalStateSnapshots } from "./merge";

function snapshotWithHostLock(
  ownerSessionId: string | null,
  acquiredAt: number,
  options: { force?: boolean } = {},
) {
  const stores = createAdminStateStores();

  if (ownerSessionId) {
    if (options.force) {
      stores.hostLockStore.acquire(
        "previous-owner-session",
        "previous-owner-token",
        acquiredAt - 1,
      );
    }
    stores.hostLockStore.acquire(ownerSessionId, `${ownerSessionId}-token`, acquiredAt, options);
  }

  return createOperationalStateSnapshot(stores, new Date(acquiredAt).toISOString());
}

function chart(id: string): DrawnChartSummary {
  return {
    id,
    name: `Chart ${id}`,
    artist: "Artist",
    displayDifficulty: "S16",
    songKey: `song-${id}`,
    chartKey: `chart-${id}`,
    sourceBgImg: "",
    localImagePath: "/chart-images/fallback-card.svg",
  };
}

function resultSet(setOrder: 1 | 2, winnerRevealStartedAt: string | null): ResultSetSnapshot {
  const selectedChart = chart(`set-${setOrder}-selected`);

  return {
    drawId: `draw-${setOrder}`,
    drawVersion: 1,
    roundSetId: `round-set-${setOrder}`,
    setOrder,
    displayLabel: setOrder === 1 ? "S16" : "S17",
    rows: [
      {
        chart: selectedChart,
        banCount: 0,
        selected: true,
        tiedForFewest: false,
      },
    ],
    maxBanCount: 1,
    leastBanCount: 0,
    selectedChart,
    tiebreakUsed: false,
    tiebreakCandidateIds: [],
    tiebreakWinnerChartId: null,
    wheelSlots: [],
    wheelSupported: false,
    winnerRevealStartedAt,
  };
}

function resultSnapshot(
  revealPhase: ResultRevealPhase,
  revealPhaseStartedAt: string,
  options: {
    finalRevealedAt?: string | null;
    setOneWinnerRevealStartedAt?: string | null;
    setTwoWinnerRevealStartedAt?: string | null;
  } = {},
): RoundResultSnapshot {
  return {
    id: "result-round-1",
    roundNumber: 1,
    computedAt: "2026-07-03T00:00:00.000Z",
    eligiblePlayers: [],
    sets: [
      resultSet(1, options.setOneWinnerRevealStartedAt ?? null),
      resultSet(2, options.setTwoWinnerRevealStartedAt ?? null),
    ],
    revealPhase,
    revealPhaseStartedAt,
    finalRevealedAt: options.finalRevealedAt ?? null,
  };
}

function snapshotWithResult(result: RoundResultSnapshot, savedAt: string) {
  const stores = createAdminStateStores();
  const snapshot = createOperationalStateSnapshot(stores, savedAt);

  snapshot.result.results = [result];

  return snapshot;
}

function snapshotWithPublicGeneration(
  generations: Partial<Record<1 | 2 | 3 | 4, number>>,
  updatedAt: string,
) {
  const snapshot = createOperationalStateSnapshot(createAdminStateStores(), updatedAt);

  for (const record of snapshot.publicStateGeneration?.rounds ?? []) {
    const generation = generations[record.roundNumber];

    if (generation === undefined) {
      continue;
    }

    record.generation = generation;
    record.transitionKind = `generation_${generation}`;
    record.updatedAt = updatedAt;
    record.activeDraws = [
      {
        drawId: `round-${record.roundNumber}-generation-${generation}`,
        roundSetId: `round-${record.roundNumber}-set-1`,
        version: Math.max(1, generation),
      },
    ];
  }

  return snapshot;
}

describe("operational state merge", () => {
  it("unions audit rows instead of treating missing rows as deletions", () => {
    const baselineStores = createAdminStateStores();
    const latestStores = createAdminStateStores();
    const currentStores = createAdminStateStores();
    const baseline = createOperationalStateSnapshot(baselineStores, "2026-07-03T00:00:00.000Z");
    const latestAudit = latestStores.auditStore.record({
      sessionId: "session-a",
      action: "pause_voting",
      summary: "Paused voting for Round 1.",
      now: "2026-07-03T00:00:01.000Z",
    });
    const currentAudit = currentStores.auditStore.record({
      sessionId: "session-b",
      action: "resume_voting",
      summary: "Resumed voting for Round 1.",
      now: "2026-07-03T00:00:02.000Z",
    });

    const merged = mergeOperationalStateSnapshots({
      baseline,
      latest: createOperationalStateSnapshot(latestStores, "2026-07-03T00:00:01.000Z"),
      current: createOperationalStateSnapshot(currentStores, "2026-07-03T00:00:02.000Z"),
    });

    expect(merged.audit.records.map((record) => record.id).sort()).toEqual(
      [latestAudit.id, currentAudit.id].sort(),
    );
  });

  it("keeps a newly acquired host lock when the latest persisted state has no lock", () => {
    const baseline = snapshotWithHostLock(null, 0);
    const current = snapshotWithHostLock("session-a", 1_000);
    const latest = snapshotWithHostLock(null, 2_000);

    const merged = mergeOperationalStateSnapshots({ baseline, current, latest });

    expect(merged.hostLock.lock?.ownerSessionId).toBe("session-a");
  });

  it("keeps the first persisted normal acquisition when another stale request also saw no lock", () => {
    const baseline = snapshotWithHostLock(null, 0);
    const staleSecondTake = snapshotWithHostLock("session-b", 2_000);
    const firstPersistedTake = snapshotWithHostLock("session-a", 1_000);

    const merged = mergeOperationalStateSnapshots({
      baseline,
      current: staleSecondTake,
      latest: firstPersistedTake,
    });

    expect(merged.hostLock.lock?.ownerSessionId).toBe("session-a");
  });

  it("prefers the newer host takeover over a stale heartbeat", () => {
    const baseline = snapshotWithHostLock("session-a", 0);
    const staleHeartbeat = snapshotWithHostLock("session-a", 1_000);
    const newerTakeover = snapshotWithHostLock("session-b", 1_200, { force: true });

    const staleAfterTakeover = mergeOperationalStateSnapshots({
      baseline,
      current: staleHeartbeat,
      latest: newerTakeover,
    });
    const takeoverAfterStale = mergeOperationalStateSnapshots({
      baseline,
      current: newerTakeover,
      latest: staleHeartbeat,
    });

    expect(staleAfterTakeover.hostLock.lock?.ownerSessionId).toBe("session-b");
    expect(takeoverAfterStale.hostLock.lock?.ownerSessionId).toBe("session-b");
  });

  it("keeps the furthest result reveal phase when merging stale snapshots", () => {
    const baseline = snapshotWithResult(
      resultSnapshot("set_1_resolved", "2026-07-03T00:00:01.000Z", {
        setOneWinnerRevealStartedAt: "2026-07-03T00:00:01.000Z",
      }),
      "2026-07-03T00:00:01.000Z",
    );
    const current = snapshotWithResult(
      resultSnapshot("set_2_counts", "2026-07-03T00:00:02.000Z", {
        setOneWinnerRevealStartedAt: "2026-07-03T00:00:01.000Z",
      }),
      "2026-07-03T00:00:02.000Z",
    );
    const latest = snapshotWithResult(
      resultSnapshot("final", "2026-07-03T00:00:04.000Z", {
        finalRevealedAt: "2026-07-03T00:00:04.000Z",
        setOneWinnerRevealStartedAt: "2026-07-03T00:00:01.000Z",
        setTwoWinnerRevealStartedAt: "2026-07-03T00:00:03.000Z",
      }),
      "2026-07-03T00:00:04.000Z",
    );

    const merged = mergeOperationalStateSnapshots({ baseline, current, latest });

    expect(merged.result.results[0]?.revealPhase).toBe("final");
    expect(merged.result.results[0]?.finalRevealedAt).toBe("2026-07-03T00:00:04.000Z");
    expect(merged.result.results[0]?.sets[1].winnerRevealStartedAt).toBe(
      "2026-07-03T00:00:03.000Z",
    );
  });

  it("keeps the highest public-state generation independently for each round", () => {
    const baseline = snapshotWithPublicGeneration({ 1: 1, 2: 1 }, "2026-07-13T00:00:01.000Z");
    const current = snapshotWithPublicGeneration({ 1: 3, 2: 2 }, "2026-07-13T00:00:03.000Z");
    const latest = snapshotWithPublicGeneration({ 1: 2, 2: 4 }, "2026-07-13T00:00:04.000Z");

    const merged = mergeOperationalStateSnapshots({ baseline, current, latest });
    const rounds = new Map(
      merged.publicStateGeneration?.rounds.map((record) => [record.roundNumber, record]),
    );

    expect(rounds.get(1)).toMatchObject({
      generation: 3,
      transitionKind: "generation_3",
    });
    expect(rounds.get(2)).toMatchObject({
      generation: 4,
      transitionKind: "generation_4",
    });
  });

  it("does not regress a public generation when the baseline or latest snapshot is legacy", () => {
    const baseline = snapshotWithPublicGeneration({ 1: 2 }, "2026-07-13T00:00:02.000Z");
    const current = snapshotWithPublicGeneration({ 1: 5 }, "2026-07-13T00:00:05.000Z");
    const legacyLatest = createOperationalStateSnapshot(
      createAdminStateStores(),
      "2026-07-13T00:00:06.000Z",
    );

    delete legacyLatest.publicStateGeneration;

    const merged = mergeOperationalStateSnapshots({ baseline, current, latest: legacyLatest });

    expect(merged.publicStateGeneration?.rounds[0]).toMatchObject({
      roundNumber: 1,
      generation: 5,
      transitionKind: "generation_5",
    });
  });
});
