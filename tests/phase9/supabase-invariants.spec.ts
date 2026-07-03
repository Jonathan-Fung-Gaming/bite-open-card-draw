import { expect, test, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  HOST_LOCK_TTL_MS,
  HostLockStore,
  resolveHostLockPersistence,
  type HostLockStoreSnapshot,
} from "../../src/lib/admin/host-lock";
import type { Database, Json } from "../../src/lib/db/database.types";
import { EVENT_SCOPED_DATABASE_TABLES } from "../../src/lib/db/schema";
import { getTestRouteHeaders, requireBaseURL, route } from "./fixtures/phase9-env";
import {
  createAdminPage,
  releaseHostAndClosePages,
  startHostedRehearsal,
} from "./flows/rehearsal.flow";
import { closeVotingForRound, openVotingForRound } from "./flows/voting-window.flow";
import { getSupabaseE2eConfig } from "./fixtures/supabase-state";

const ROUND_NUMBER = 1;
const CONCURRENT_PLAYERS = [
  "Rehearsal Player 01",
  "Rehearsal Player 02",
  "Rehearsal Player 03",
  "Rehearsal Player 04",
] as const;
const HOST_LOCK_EVIDENCE_NAME = "tournament-host";
const NEIGHBOR_ONLY_PLAYER = "Phase 9 Neighbor Event Only";

type RuntimeTableName = keyof Database["public"]["Tables"];
type SupabaseError = { message: string };
type QueryResult<Row> = {
  count: number | null;
  data: Row[] | null;
  error: SupabaseError | null;
};
type SingleMutationResult<Row> = {
  data: Row | null;
  error: SupabaseError | null;
};
type RpcResult<Result> = {
  data: Result | null;
  error: SupabaseError | null;
};
type QueryChain<Row> = PromiseLike<QueryResult<Row>> & {
  eq: (column: string, value: unknown) => QueryChain<Row>;
  is: (column: string, value: unknown) => QueryChain<Row>;
  limit: (count: number) => QueryChain<Row>;
};
type MutationSelectChain<Row> = {
  maybeSingle: () => Promise<SingleMutationResult<Row>>;
};
type UpsertChain<Row> = {
  select: (columns: string) => MutationSelectChain<Row>;
};
type UpdateChain<Row> = {
  eq: (column: string, value: unknown) => UpdateChain<Row>;
  select: (columns: string) => MutationSelectChain<Row>;
};
type DeleteChain = PromiseLike<{ error: SupabaseError | null }> & {
  eq: (column: string, value: unknown) => DeleteChain;
};
type SupabaseTestClient = {
  from: <Row extends Record<string, unknown> = Record<string, unknown>>(
    table: string,
  ) => {
    delete: () => DeleteChain;
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => QueryChain<Row>;
    update: (values: Record<string, unknown>) => UpdateChain<Row>;
    upsert: (
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => UpsertChain<Row>;
  };
  rpc: <Result = Json>(name: string, args?: Record<string, unknown>) => Promise<RpcResult<Result>>;
};
type HostLockEvidenceRow = {
  acquired_at: string;
  admin_session_id: string | null;
  event_id: string;
  expires_at: string;
  heartbeat_at: string;
  host_token_hash: string;
  lock_name: string;
  owner_session_id: string | null;
  released_at: string | null;
};
const EVENT_SCOPED_RUNTIME_TABLES: readonly RuntimeTableName[] = EVENT_SCOPED_DATABASE_TABLES;

function createSupabaseClients(config: NonNullable<ReturnType<typeof getSupabaseE2eConfig>>) {
  const anonKey =
    process.env.E2E_NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error("Missing Supabase anon key for RPC permission evidence.");
  }

  return {
    anon: createClient(config.url, anonKey, {
      auth: { persistSession: false },
    }) as unknown as SupabaseTestClient,
    service: createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false },
    }) as unknown as SupabaseTestClient,
  };
}

async function expectRuntimeTablesEventScoped(service: SupabaseTestClient, eventId: string) {
  for (const table of EVENT_SCOPED_RUNTIME_TABLES) {
    const { error } = await service.from(table).select("event_id").eq("event_id", eventId).limit(1);

    expect(error, `${table} should be queryable with event_id scoping`).toBeNull();
  }
}

function neighborEventIdFor(eventId: string) {
  return `${eventId}-neighbor`;
}

async function deleteNeighborEventRows(service: SupabaseTestClient, eventId: string) {
  const { error } = await service.from("players").delete().eq("event_id", eventId);

  expect(error).toBeNull();
}

async function seedNeighborEventOnlyPlayer(service: SupabaseTestClient, baseEventId: string) {
  const eventId = neighborEventIdFor(baseEventId);

  await deleteNeighborEventRows(service, eventId);

  const { data, error } = await service
    .from<{ event_id: string; id: string; startgg_username: string }>("players")
    .upsert({
      active: true,
      event_id: eventId,
      has_tournament_history: false,
      id: randomUUID(),
      startgg_username: NEIGHBOR_ONLY_PLAYER,
      startgg_username_normalized: NEIGHBOR_ONLY_PLAYER.toLowerCase(),
    })
    .select("event_id,id,startgg_username")
    .maybeSingle();

  expect(error).toBeNull();
  expect(data).toMatchObject({
    event_id: eventId,
    startgg_username: NEIGHBOR_ONLY_PLAYER,
  });

  return eventId;
}

async function expectNeighborEventPlayerRejectedByConfiguredRoute(
  request: APIRequestContext,
  baseURL: string,
) {
  const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
    headers: getTestRouteHeaders(),
    data: {
      playerStartggUsername: NEIGHBOR_ONLY_PLAYER,
      revision: 1,
      roundNumber: ROUND_NUMBER,
    },
  });
  const payload = (await response.json()) as { error?: string };

  expect(response.status()).toBe(404);
  expect(payload.error).toBe("Player is not eligible for this round.");
}

async function expectAnonRpcDenied(anon: SupabaseTestClient, eventId: string) {
  const deniedAttempts = [
    {
      name: "normalized_database_time",
      promise: anon.rpc("normalized_database_time", {}),
    },
    {
      name: "normalized_compute_results",
      promise: anon.rpc("normalized_compute_results", {
        p_event_id: eventId,
        p_payload: { roundNumber: 1 } satisfies Json,
      }),
    },
    {
      name: "normalized_submit_ballot",
      promise: anon.rpc("normalized_submit_ballot", {
        p_event_id: eventId,
        p_payload: {
          choices: [],
          playerId: "00000000-0000-4000-8000-000000000001",
          roundNumber: 1,
        } satisfies Json,
      }),
    },
  ] as const;

  for (const rpc of deniedAttempts) {
    const { error } = await rpc.promise;

    expect(error, `${rpc.name} should be unavailable to anon clients`).toBeTruthy();
    expect(error?.message.toLowerCase()).toMatch(/permission|not found|schema cache|not allowed/);
  }
}

async function deleteHostLockEvidenceRow(service: SupabaseTestClient, eventId: string) {
  const { error } = await service
    .from("host_locks")
    .delete()
    .eq("event_id", eventId)
    .eq("lock_name", HOST_LOCK_EVIDENCE_NAME);

  expect(error).toBeNull();
}

async function upsertHostLockEvidenceAdminSessions(
  service: SupabaseTestClient,
  eventId: string,
  sessionIds: readonly string[],
  baseMs: number,
) {
  for (const sessionId of sessionIds) {
    const { data, error } = await service
      .from<{ id: string }>("admin_sessions")
      .upsert({
        event_id: eventId,
        expires_at: new Date(baseMs + 2 * HOST_LOCK_TTL_MS).toISOString(),
        id: sessionId,
        last_seen_at: new Date(baseMs).toISOString(),
        revoked_at: null,
        session_token_hash: `phase9-host-lock-${sessionId}`,
      })
      .select("id")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data?.id).toBe(sessionId);
  }
}

async function deleteHostLockEvidenceAdminSessions(
  service: SupabaseTestClient,
  eventId: string,
  sessionIds: readonly string[],
) {
  for (const sessionId of sessionIds) {
    const { error } = await service
      .from("admin_sessions")
      .delete()
      .eq("event_id", eventId)
      .eq("id", sessionId);

    expect(error).toBeNull();
  }
}

function snapshotFromHostLockRow(row: HostLockEvidenceRow | null): HostLockStoreSnapshot {
  return {
    lock: row
      ? {
          acquiredAt: Date.parse(row.acquired_at),
          expiresAt: Date.parse(row.expires_at),
          heartbeatAt: Date.parse(row.heartbeat_at),
          hostTokenHash: row.host_token_hash,
          ownerSessionId: row.owner_session_id ?? row.admin_session_id ?? "",
        }
      : null,
  };
}

async function readHostLockEvidenceSnapshot(
  service: SupabaseTestClient,
  eventId: string,
): Promise<HostLockStoreSnapshot> {
  const { data, error } = await service
    .from<HostLockEvidenceRow>("host_locks")
    .select(
      "admin_session_id,event_id,lock_name,owner_session_id,host_token_hash,acquired_at,heartbeat_at,expires_at,released_at",
    )
    .eq("event_id", eventId)
    .eq("lock_name", HOST_LOCK_EVIDENCE_NAME)
    .limit(1);

  expect(error).toBeNull();

  return snapshotFromHostLockRow(((data ?? []) as HostLockEvidenceRow[])[0] ?? null);
}

async function upsertProductionHostLockRecord(
  service: SupabaseTestClient,
  eventId: string,
  lock: NonNullable<HostLockStoreSnapshot["lock"]>,
) {
  const { data, error } = await service
    .from<HostLockEvidenceRow>("host_locks")
    .upsert(
      {
        event_id: eventId,
        lock_name: HOST_LOCK_EVIDENCE_NAME,
        admin_session_id: lock.ownerSessionId,
        owner_session_id: lock.ownerSessionId,
        host_token_hash: lock.hostTokenHash,
        acquired_at: new Date(lock.acquiredAt).toISOString(),
        heartbeat_at: new Date(lock.heartbeatAt).toISOString(),
        expires_at: new Date(lock.expiresAt).toISOString(),
        released_at: null,
      },
      { onConflict: "event_id,lock_name" },
    )
    .select(
      "admin_session_id,event_id,lock_name,owner_session_id,host_token_hash,acquired_at,heartbeat_at,expires_at,released_at",
    )
    .maybeSingle();

  expect(error).toBeNull();
  expect(data).toBeTruthy();

  return snapshotFromHostLockRow(data as HostLockEvidenceRow);
}

async function persistProductionHostLockDecision(
  service: SupabaseTestClient,
  input: {
    eventId: string;
    baseline: HostLockStoreSnapshot | null;
    current: HostLockStoreSnapshot;
    now: number;
  },
) {
  const latest = await readHostLockEvidenceSnapshot(service, input.eventId);
  const decision = resolveHostLockPersistence({
    baseline: input.baseline,
    current: input.current,
    latest,
    now: input.now,
  });

  if (decision.action === "delete") {
    await deleteHostLockEvidenceRow(service, input.eventId);
  }

  if (decision.action === "write") {
    await upsertProductionHostLockRecord(service, input.eventId, decision.lock);
  }

  const persisted = await readHostLockEvidenceSnapshot(service, input.eventId);

  return { decision, persisted };
}

async function expectSupabaseHostLockInvariants(service: SupabaseTestClient, eventId: string) {
  const baseMs = Date.now();
  const sessionA = randomUUID();
  const sessionB = randomUUID();
  const sessionC = randomUUID();
  const tokenA = `phase9-host-token-${randomUUID()}`;
  const tokenB = `phase9-host-token-${randomUUID()}`;
  const tokenC = `phase9-host-token-${randomUUID()}`;
  const syntheticSessionIds = [sessionA, sessionB, sessionC] as const;

  await deleteHostLockEvidenceRow(service, eventId);

  try {
    await upsertHostLockEvidenceAdminSessions(service, eventId, syntheticSessionIds, baseMs);

    const storeA = new HostLockStore();
    const acquired = storeA.acquire(sessionA, tokenA, baseMs);
    const acquiredSnapshot = storeA.exportSnapshot();
    const persistedAcquired = await persistProductionHostLockDecision(service, {
      baseline: null,
      current: acquiredSnapshot,
      eventId,
      now: baseMs,
    });

    expect(acquired.snapshot.status).toBe("active");
    expect(persistedAcquired.decision.outcome).toBe("acquire");
    expect(persistedAcquired.persisted.lock?.ownerSessionId).toBe(sessionA);
    expect(persistedAcquired.persisted.lock?.hostTokenHash).toBe(
      acquiredSnapshot.lock?.hostTokenHash,
    );
    expect((persistedAcquired.persisted.lock?.expiresAt ?? 0) - baseMs).toBe(HOST_LOCK_TTL_MS);

    const nonOwnerStore = new HostLockStore();

    nonOwnerStore.importSnapshot(persistedAcquired.persisted);
    expect(nonOwnerStore.getSnapshot(sessionB, baseMs + 1).status).toBe("readonly");
    expect(() => nonOwnerStore.acquire(sessionB, tokenB, baseMs + 1)).toThrow(
      "Active host lock is still unexpired",
    );

    expect(storeA.refresh(sessionA, tokenA, baseMs + 15_000)).toBe(true);
    const refreshedSnapshot = storeA.exportSnapshot();
    const persistedRefreshed = await persistProductionHostLockDecision(service, {
      baseline: acquiredSnapshot,
      current: refreshedSnapshot,
      eventId,
      now: baseMs + 15_000,
    });

    expect(persistedRefreshed.decision.outcome).toBe("refresh");
    expect(persistedRefreshed.persisted.lock?.ownerSessionId).toBe(sessionA);
    expect(persistedRefreshed.persisted.lock?.heartbeatAt).toBe(baseMs + 15_000);
    expect(persistedRefreshed.persisted.lock?.expiresAt).toBe(baseMs + 15_000 + HOST_LOCK_TTL_MS);

    const expiredStore = new HostLockStore();
    const expiredAcquireAt = (persistedRefreshed.persisted.lock?.expiresAt ?? baseMs) + 1;

    expiredStore.importSnapshot(persistedRefreshed.persisted);
    const afterExpiryAcquire = expiredStore.acquire(sessionB, tokenB, expiredAcquireAt);
    const expiredAcquireSnapshot = expiredStore.exportSnapshot();
    const persistedExpiredAcquire = await persistProductionHostLockDecision(service, {
      baseline: persistedRefreshed.persisted,
      current: expiredAcquireSnapshot,
      eventId,
      now: expiredAcquireAt,
    });

    expect(afterExpiryAcquire.takeover).toBe(false);
    expect(afterExpiryAcquire.snapshot.status).toBe("active");
    expect(persistedExpiredAcquire.decision.outcome).toBe("takeover");
    expect(persistedExpiredAcquire.persisted.lock?.ownerSessionId).toBe(sessionB);

    const forcedStore = new HostLockStore();
    const forcedAt = expiredAcquireAt + 1_000;

    forcedStore.importSnapshot(persistedExpiredAcquire.persisted);
    const forcedTakeover = forcedStore.acquire(sessionC, tokenC, forcedAt, { force: true });
    const forcedTakeoverSnapshot = forcedStore.exportSnapshot();
    const persistedForcedTakeover = await persistProductionHostLockDecision(service, {
      baseline: persistedExpiredAcquire.persisted,
      current: forcedTakeoverSnapshot,
      eventId,
      now: forcedAt,
    });

    expect(forcedTakeover.takeover).toBe(true);
    expect(persistedForcedTakeover.decision.outcome).toBe("takeover");
    expect(persistedForcedTakeover.persisted.lock?.ownerSessionId).toBe(sessionC);

    const { count, error: countError } = await service
      .from("host_locks")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("lock_name", HOST_LOCK_EVIDENCE_NAME);

    expect(countError).toBeNull();
    expect(count).toBe(1);
  } finally {
    await deleteHostLockEvidenceRow(service, eventId);
    await deleteHostLockEvidenceAdminSessions(service, eventId, syntheticSessionIds);
  }
}

async function submitLoadBallot(
  request: APIRequestContext,
  baseURL: string,
  playerStartggUsername: string,
  revision: 1 | 2,
) {
  const response = await request.post(route(baseURL, "/api/e2e/load-ballot"), {
    headers: getTestRouteHeaders(),
    data: {
      playerStartggUsername,
      revision,
      roundNumber: ROUND_NUMBER,
    },
  });
  const payload = (await response.json()) as {
    eligibleCount?: number;
    error?: string;
    playerStartggUsername?: string;
    revision?: number;
    status?: string;
    submittedCount?: number;
  };

  expect(response.ok(), payload.error ?? `load-ballot returned HTTP ${response.status()}`).toBe(
    true,
  );
  expect(payload.playerStartggUsername).toBe(playerStartggUsername);
  expect(payload.revision).toBe(revision);
  expect(payload.eligibleCount).toBe(12);
  expect(["voting_open", "final_30_seconds", "extension_1_minute"]).toContain(payload.status);

  return payload;
}

async function expectConcurrentComputeResultsSerialized(
  service: SupabaseTestClient,
  eventId: string,
) {
  const attempts = await Promise.all([
    service.rpc("normalized_compute_results", {
      p_event_id: eventId,
      p_payload: { roundNumber: ROUND_NUMBER } satisfies Json,
    }),
    service.rpc("normalized_compute_results", {
      p_event_id: eventId,
      p_payload: { roundNumber: ROUND_NUMBER } satisfies Json,
    }),
  ]);
  const successes = attempts.filter((attempt) => !attempt.error);
  const failures = attempts.filter((attempt) => attempt.error);

  expect(successes).toHaveLength(1);
  expect(successes[0]?.data as Record<string, unknown>).toMatchObject({
    roundNumber: ROUND_NUMBER,
    status: "results_computed",
  });
  expect(failures).toHaveLength(1);
  expect(failures[0]?.error?.message).toBeTruthy();
}

async function expectSupabaseRoundStateAfterConcurrentWrites(
  service: SupabaseTestClient,
  eventId: string,
) {
  const [
    { count: ballotCount, error: ballotError },
    { count: choiceCount, error: choiceError },
    { data: resultSnapshots, error: resultError },
  ] = await Promise.all([
    service
      .from("ballots")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("round_number", ROUND_NUMBER)
      .is("invalidated_at", null),
    service
      .from("ballot_choices")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    service
      .from<{ id: string; reveal_phase: string }>("result_snapshots")
      .select("id,reveal_phase")
      .eq("event_id", eventId)
      .eq("round_number", ROUND_NUMBER),
  ]);

  expect(ballotError).toBeNull();
  expect(choiceError).toBeNull();
  expect(resultError).toBeNull();
  expect(ballotCount).toBe(CONCURRENT_PLAYERS.length);
  expect(choiceCount).toBe(CONCURRENT_PLAYERS.length * 2);
  expect(resultSnapshots).toHaveLength(1);
  expect(resultSnapshots?.[0]?.reveal_phase).toBe("computed");

  const resultSnapshotId = resultSnapshots?.[0]?.id;
  const [
    { count: resultRowCount, error: resultRowError },
    { count: selectedRowCount, error: selectedRowError },
  ] = await Promise.all([
    service
      .from("result_rows")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("result_snapshot_id", resultSnapshotId),
    service
      .from("result_rows")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("result_snapshot_id", resultSnapshotId)
      .eq("is_selected", true),
  ]);

  expect(resultRowError).toBeNull();
  expect(selectedRowError).toBeNull();
  expect(resultRowCount).toBe(14);
  expect(selectedRowCount).toBe(2);
}

test("Supabase invariants cover migration shape, RPC permissions, and concurrency @smoke @supabase-smoke", async ({
  page,
  request,
  baseURL,
}) => {
  const config = getSupabaseE2eConfig();

  if (!config) {
    test.skip(true, "Supabase invariant evidence runs only in Supabase profiles.");
    return;
  }

  const resolvedBaseURL = requireBaseURL(baseURL);
  const { anon, service } = createSupabaseClients(config);
  const adminPage = createAdminPage(page, resolvedBaseURL);
  let neighborEventId: string | null = null;
  let testError: unknown = null;

  try {
    const { data: databaseTime, error: databaseTimeError } = await service.rpc(
      "normalized_database_time",
      {},
    );

    expect(databaseTimeError).toBeNull();
    expect(Number.isNaN(Date.parse(String(databaseTime)))).toBe(false);
    await expectRuntimeTablesEventScoped(service, config.eventId);
    await expectAnonRpcDenied(anon, config.eventId);
    await expectSupabaseHostLockInvariants(service, config.eventId);
    neighborEventId = await seedNeighborEventOnlyPlayer(service, config.eventId);

    await startHostedRehearsal(adminPage, "Phase 9 Supabase invariant and concurrency evidence");
    await adminPage.drawCurrentRound(ROUND_NUMBER);
    await openVotingForRound(adminPage, ROUND_NUMBER);
    await expectNeighborEventPlayerRejectedByConfiguredRoute(request, resolvedBaseURL);

    const submittedPayloads = await Promise.all(
      CONCURRENT_PLAYERS.map((player) => submitLoadBallot(request, resolvedBaseURL, player, 1)),
    );

    expect(new Set(submittedPayloads.map((payload) => payload.playerStartggUsername)).size).toBe(
      CONCURRENT_PLAYERS.length,
    );

    await closeVotingForRound(adminPage, ROUND_NUMBER);
    await expectConcurrentComputeResultsSerialized(service, config.eventId);
    await expectSupabaseRoundStateAfterConcurrentWrites(service, config.eventId);
  } catch (error) {
    testError = error;
    throw error;
  } finally {
    try {
      await releaseHostAndClosePages(adminPage, null, testError);
    } finally {
      if (neighborEventId) {
        await deleteNeighborEventRows(service, neighborEventId);
      }
    }
  }
});
