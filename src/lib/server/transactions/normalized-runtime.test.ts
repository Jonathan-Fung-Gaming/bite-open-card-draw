import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Json } from "@/lib/db/database.types";
import {
  executeNormalizedTransactionalMutation,
  NORMALIZED_ALL_RUNTIME_RPC_NAMES,
  NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES,
  NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATIONS,
  NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATION_SCHEMAS,
  NORMALIZED_RUNTIME_RPC_NAMES,
  NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS,
  assertNormalizedTransactionalMutationImplemented,
  type NormalizedBlockedTransactionalMutationName,
  type NormalizedRuntimeMutationName,
  type NormalizedTransactionalMutationName,
} from "@/lib/server/transactions/normalized-runtime";

vi.mock("server-only", () => ({}));

const uuidA = "00000000-0000-4000-8000-000000000001";
const uuidB = "00000000-0000-4000-8000-000000000002";
const uuidC = "00000000-0000-4000-8000-000000000003";
const normalizedAdminContext = {
  requestId: uuidA,
  adminSessionId: uuidB,
  hostTokenHash: "a".repeat(64),
  expectedGeneration: 0,
};

type TransactionDependencies = NonNullable<
  Parameters<typeof executeNormalizedTransactionalMutation>[2]
>;
type MockRpcClient = NonNullable<TransactionDependencies["supabase"]>;
type RpcFunctionName = (typeof NORMALIZED_RUNTIME_RPC_NAMES)[NormalizedTransactionalMutationName];

type RpcCall = {
  functionName: RpcFunctionName | "normalized_read_public_generation_key";
  args: Record<string, Json>;
};

const implementedMutationNames: NormalizedTransactionalMutationName[] = [
  "claimActiveVoterPresence",
  "submitBallot",
  "computeResults",
  "advanceVotingTimer",
  "pauseVotingWindow",
  "resumeVotingWindow",
  "closeVotingWindow",
  "manualBallotOverride",
  "reopenVotingWindow",
  "resetRound",
  "openVotingWindow",
  "rerollOneChart",
  "rerollRoundSet",
  "rerollFullRound",
  "advanceResultReveal",
  "markResultsRevealed",
  "acquireHostLock",
  "refreshHostLock",
  "releaseHostLock",
];

const blockedMutationNames: NormalizedBlockedTransactionalMutationName[] = [
  "touchActiveVoterPresence",
  "drawRoundSet",
  "postVoteRerollInvalidation",
  "overrideResult",
  "adminSessionCreate",
  "adminSessionTouch",
  "adminSessionLogout",
  "adminSessionRevoke",
];

const allMutationNames: NormalizedRuntimeMutationName[] = [
  ...implementedMutationNames,
  ...blockedMutationNames,
];

function readMigrations() {
  const migrationsDirectory = path.join(process.cwd(), "supabase/migrations");

  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(path.join(migrationsDirectory, fileName), "utf8"))
    .join("\n");
}

function readPhase1Migration() {
  return readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260713020000_phase1_atomic_reroll_reveal_public_state.sql",
    ),
    "utf8",
  );
}

function readPhase3Migration() {
  return readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260714010000_phase3_non_expiring_host_recovery.sql",
    ),
    "utf8",
  );
}

function phase1FunctionDefinition(source: string, functionName: string) {
  const start = source.lastIndexOf(`create or replace function public.${functionName}(`);

  if (start < 0) {
    return "";
  }

  const end = source.indexOf("\n$$;", start);

  return end < 0 ? source.slice(start) : source.slice(start, end + "\n$$;".length);
}

function rpcDefinitions(migrations: string, rpcName: string) {
  return [
    ...migrations.matchAll(
      new RegExp(
        `create or replace function public\\.${rpcName}\\s*\\(\\s*p_event_id text,\\s*p_payload jsonb\\s*\\)[\\s\\S]*?(?=\\ncreate or replace function public\\.|\\nrevoke execute on function public\\.|$)`,
        "gi",
      ),
    ),
  ].map((match) => match[0]);
}

function latestRpcDefinition(migrations: string, rpcName: string) {
  const matches = rpcDefinitions(migrations, rpcName);

  return matches.at(-1) ?? "";
}

function latestRowChangingRpcDefinition(migrations: string, rpcName: string) {
  const definitions = rpcDefinitions(migrations, rpcName);
  const latest = definitions.at(-1) ?? "";

  return latest.includes("_without_phase1_projection_20260713")
    ? (definitions.at(-2) ?? latest)
    : latest;
}

function createMockRpcClient(
  calls: RpcCall[],
  response: { data: Json | null; error: { message: string } | null } = {
    data: { committed: true, rows_changed: 1 },
    error: null,
  },
): MockRpcClient {
  return {
    async rpc(functionName, args) {
      calls.push({
        functionName: functionName as RpcCall["functionName"],
        args,
      });

      if (functionName === "normalized_read_public_generation_key") {
        return { data: { generationKey: "phase1-capability" }, error: null };
      }

      return response;
    },
  };
}

describe("normalized runtime transactional mutations", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the transactional mutation boundary server-only", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/server/transactions/normalized-runtime.ts"),
      "utf8",
    );

    expect(source).toContain('import "server-only"');
  });

  it("defines every required transactional mutation", () => {
    expect(Object.keys(NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS)).toEqual(
      implementedMutationNames,
    );
    expect(Object.keys(NORMALIZED_RUNTIME_RPC_NAMES)).toEqual(implementedMutationNames);
    expect(Object.keys(NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATION_SCHEMAS)).toEqual(
      blockedMutationNames,
    );
    expect(Object.keys(NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES)).toEqual(blockedMutationNames);
    expect(Object.keys(NORMALIZED_ALL_RUNTIME_RPC_NAMES)).toEqual(allMutationNames);
  });

  it("has a Supabase RPC function for every implemented or blocked transactional mutation", () => {
    const migrations = readMigrations();

    for (const rpcName of Object.values(NORMALIZED_ALL_RUNTIME_RPC_NAMES)) {
      expect(migrations).toMatch(
        new RegExp(
          `function public\\.${rpcName}\\s*\\(\\s*p_event_id text,\\s*p_payload jsonb\\s*\\)`,
          "i",
        ),
      );
    }
  });

  it("blocks runtime mutations whose latest migration body is still disabled", () => {
    const migrations = readMigrations();

    expect(Object.keys(NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATIONS)).toEqual(blockedMutationNames);

    for (const [name, rpcName] of Object.entries(NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES)) {
      const definition = latestRpcDefinition(migrations, rpcName);

      expect(definition, `${name} should have a migration definition`).not.toBe("");
      expect(definition, `${name} should remain explicitly blocked`).toContain(
        "normalized_runtime_transaction_disabled",
      );
      expect(() =>
        assertNormalizedTransactionalMutationImplemented(name as NormalizedRuntimeMutationName),
      ).toThrow(/currently disabled in migrations/);
    }
  });

  it("does not mark implemented runtime mutations as blocked", () => {
    for (const name of implementedMutationNames) {
      expect(() => assertNormalizedTransactionalMutationImplemented(name)).not.toThrow();
    }
  });

  it("validates input and executes the mapped RPC with the configured event id", async () => {
    const calls: RpcCall[] = [];
    const result = await executeNormalizedTransactionalMutation(
      "submitBallot",
      {
        roundNumber: 1,
        expectedGeneration: 0,
        playerId: uuidA,
        deviceId: "device-event-a",
        choices: [
          { drawId: uuidB, roundSetId: uuidA, noBans: false, bannedChartIds: [uuidC] },
          { drawId: uuidC, roundSetId: uuidB, noBans: true, bannedChartIds: [] },
        ],
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    expect(result).toEqual({ committed: true, rows_changed: 1 });
    expect(calls).toEqual([
      {
        functionName: "normalized_read_public_generation_key",
        args: { p_event_id: "event-a" },
      },
      {
        functionName: "normalized_submit_ballot",
        args: {
          p_event_id: "event-a",
          p_payload: {
            roundNumber: 1,
            expectedGeneration: 0,
            playerId: uuidA,
            deviceId: "device-event-a",
            choices: [
              { drawId: uuidB, roundSetId: uuidA, noBans: false, bannedChartIds: [uuidC] },
              { drawId: uuidC, roundSetId: uuidB, noBans: true, bannedChartIds: [] },
            ],
          },
        },
      },
    ]);
  });

  it("executes durable voting timer advancement through the normalized timer RPC", async () => {
    const calls: RpcCall[] = [];
    const result = await executeNormalizedTransactionalMutation(
      "advanceVotingTimer",
      { roundNumber: 1 },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls, {
          data: { committed: true, changed: true, rows_changed: 1, status: "extension_1_minute" },
          error: null,
        }),
      },
    );

    expect(result).toEqual({
      committed: true,
      changed: true,
      rows_changed: 1,
      status: "extension_1_minute",
    });
    expect(calls).toEqual([
      {
        functionName: "normalized_advance_voting_timer",
        args: {
          p_event_id: "event-a",
          p_payload: { roundNumber: 1 },
        },
      },
    ]);
  });

  it("validates and executes the implemented Phase 3 host lifecycle RPCs", async () => {
    const calls: RpcCall[] = [];
    const supabase = createMockRpcClient(calls, {
      data: {
        outcome: "refreshed",
        ownerSessionId: uuidB,
        heartbeatAt: "2026-07-14T00:00:00.000Z",
        expiresAt: "9999-12-31T23:59:59.999Z",
        rows_changed: 1,
      },
      error: null,
    });

    await executeNormalizedTransactionalMutation(
      "acquireHostLock",
      {
        requestId: uuidA,
        mode: "restore",
        adminSessionId: uuidB,
        hostTokenHash: "a".repeat(64),
        expectedHostTokenHash: "b".repeat(64),
        recoveryOwnerSessionId: uuidC,
      },
      { eventId: "event-a", supabase },
    );
    await executeNormalizedTransactionalMutation(
      "refreshHostLock",
      {
        requestId: uuidA,
        adminSessionId: uuidB,
        hostTokenHash: "a".repeat(64),
      },
      { eventId: "event-a", supabase },
    );
    await executeNormalizedTransactionalMutation(
      "releaseHostLock",
      {
        requestId: uuidA,
        adminSessionId: uuidB,
        hostTokenHash: "a".repeat(64),
      },
      { eventId: "event-a", supabase },
    );

    expect(calls).toEqual([
      {
        functionName: "normalized_acquire_host_lock",
        args: {
          p_event_id: "event-a",
          p_payload: {
            requestId: uuidA,
            mode: "restore",
            adminSessionId: uuidB,
            hostTokenHash: "a".repeat(64),
            expectedHostTokenHash: "b".repeat(64),
            recoveryOwnerSessionId: uuidC,
          },
        },
      },
      {
        functionName: "normalized_heartbeat_host_lock",
        args: {
          p_event_id: "event-a",
          p_payload: {
            requestId: uuidA,
            adminSessionId: uuidB,
            hostTokenHash: "a".repeat(64),
          },
        },
      },
      {
        functionName: "normalized_release_host_lock",
        args: {
          p_event_id: "event-a",
          p_payload: {
            requestId: uuidA,
            adminSessionId: uuidB,
            hostTokenHash: "a".repeat(64),
          },
        },
      },
    ]);
  });

  it("executes pause and resume with Phase 1 host and generation context", async () => {
    const calls: RpcCall[] = [];
    const supabase = createMockRpcClient(calls);

    await executeNormalizedTransactionalMutation(
      "pauseVotingWindow",
      { ...normalizedAdminContext, roundNumber: 1 },
      { eventId: "event-a", supabase },
    );
    await executeNormalizedTransactionalMutation(
      "resumeVotingWindow",
      { ...normalizedAdminContext, expectedGeneration: 1, roundNumber: 1 },
      { eventId: "event-a", supabase },
    );

    expect(calls).toEqual([
      {
        functionName: "normalized_read_public_generation_key",
        args: { p_event_id: "event-a" },
      },
      {
        functionName: "normalized_pause_voting_window",
        args: {
          p_event_id: "event-a",
          p_payload: { ...normalizedAdminContext, roundNumber: 1 },
        },
      },
      {
        functionName: "normalized_read_public_generation_key",
        args: { p_event_id: "event-a" },
      },
      {
        functionName: "normalized_resume_voting_window",
        args: {
          p_event_id: "event-a",
          p_payload: { ...normalizedAdminContext, expectedGeneration: 1, roundNumber: 1 },
        },
      },
    ]);
  });

  it("executes emergency admin RPCs with sanitized server-side payloads", async () => {
    const calls: RpcCall[] = [];

    await executeNormalizedTransactionalMutation(
      "manualBallotOverride",
      {
        roundNumber: 1,
        playerId: uuidA,
        choices: [
          { drawId: uuidB, roundSetId: uuidA, noBans: false, bannedChartIds: [uuidC] },
          { drawId: uuidC, roundSetId: uuidB, noBans: true, bannedChartIds: [] },
        ],
        replaceExistingBallot: true,
        reason: "paper backup",
        adminSessionId: uuidB,
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    await executeNormalizedTransactionalMutation(
      "reopenVotingWindow",
      {
        ...normalizedAdminContext,
        roundNumber: 1,
        durationMinutes: 3,
        reason: "phone issue",
        adminSessionId: uuidB,
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    await executeNormalizedTransactionalMutation(
      "closeVotingWindow",
      {
        roundNumber: 1,
        adminSessionId: uuidB,
        hostTokenHash: "a".repeat(64),
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    await executeNormalizedTransactionalMutation(
      "resetRound",
      {
        ...normalizedAdminContext,
        roundNumber: 1,
        reason: "operator correction",
        adminSessionId: uuidB,
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    expect(calls.map((call) => call.functionName)).toEqual([
      "normalized_manual_ballot_override",
      "normalized_read_public_generation_key",
      "normalized_reopen_voting_window",
      "normalized_close_voting_window",
      "normalized_read_public_generation_key",
      "normalized_reset_round",
    ]);
    for (const call of calls.filter((call) => "p_payload" in call.args)) {
      expect(call.args.p_payload).not.toHaveProperty("adminPassword");
      expect(call.args.p_payload).toHaveProperty("adminSessionId", uuidB);
      if (call.functionName !== "normalized_close_voting_window") {
        expect(call.args.p_payload).toHaveProperty("reason");
      }
    }
  });

  it("uses TOURNAMENT_EVENT_ID when no explicit event id is passed", async () => {
    const calls: RpcCall[] = [];

    vi.stubEnv("TOURNAMENT_EVENT_ID", "env-event");

    await executeNormalizedTransactionalMutation(
      "computeResults",
      { ...normalizedAdminContext, roundNumber: 1 },
      { supabase: createMockRpcClient(calls) },
    );

    expect(calls[0]?.args.p_event_id).toBe("env-event");
  });

  it("does not call RPC when validation fails", async () => {
    const calls: RpcCall[] = [];

    await expect(
      executeNormalizedTransactionalMutation(
        "submitBallot",
        {
          roundNumber: 1,
          expectedGeneration: 0,
          playerId: "not-a-uuid",
          deviceId: "device-event-a",
          choices: [],
        },
        {
          eventId: "event-a",
          supabase: createMockRpcClient(calls),
        },
      ),
    ).rejects.toThrow();

    expect(calls).toEqual([]);
  });

  it("surfaces Supabase RPC errors", async () => {
    await expect(
      executeNormalizedTransactionalMutation(
        "computeResults",
        { ...normalizedAdminContext, roundNumber: 1 },
        {
          eventId: "event-a",
          supabase: createMockRpcClient([], {
            data: null,
            error: { message: "transaction failed" },
          }),
        },
      ),
    ).rejects.toThrow(/computeResults failed: transaction failed/);
  });

  it("fails closed before an upgraded legacy RPC can mutate without the Phase 1 capability", async () => {
    const calls: RpcCall[] = [];
    const supabase: MockRpcClient = {
      async rpc(functionName, args) {
        calls.push({ functionName: functionName as RpcCall["functionName"], args });
        return { data: null, error: { message: "function does not exist" } };
      },
    };

    await expect(
      executeNormalizedTransactionalMutation(
        "computeResults",
        { ...normalizedAdminContext, roundNumber: 1 },
        { eventId: "event-a", supabase },
      ),
    ).rejects.toThrow(/unavailable until the Phase 1 database migration is applied/);
    expect(calls).toEqual([
      {
        functionName: "normalized_read_public_generation_key",
        args: { p_event_id: "event-a" },
      },
    ]);
  });

  it("rejects placeholder commit acknowledgements that do not prove rows changed", async () => {
    await expect(
      executeNormalizedTransactionalMutation(
        "submitBallot",
        {
          roundNumber: 1,
          expectedGeneration: 0,
          playerId: uuidA,
          deviceId: "device-event-a",
          choices: [
            { drawId: uuidB, roundSetId: uuidA, noBans: false, bannedChartIds: [uuidC] },
            { drawId: uuidC, roundSetId: uuidB, noBans: true, bannedChartIds: [] },
          ],
        },
        {
          eventId: "event-a",
          supabase: createMockRpcClient([], {
            data: { committed: true },
            error: null,
          }),
        },
      ),
    ).rejects.toThrow(/placeholder commit acknowledgement/);
  });

  it("implements production ballot/result RPCs as row-changing transactions", () => {
    const migrations = readMigrations();
    const submitFunctions = [
      ...migrations.matchAll(
        /create or replace function public\.normalized_submit_ballot\(p_event_id text, p_payload jsonb\)[\s\S]*?grant execute on function public\.normalized_submit_ballot\(text, jsonb\) to service_role;/gi,
      ),
    ];
    const submitFunction = submitFunctions.at(-1)?.[0];
    const computeFunction = latestRowChangingRpcDefinition(
      migrations,
      "normalized_compute_results",
    );

    expect(migrations).not.toContain("least(v_closes_at, p_now + interval '30 seconds')");
    expect(submitFunction).toContain("normalized_apply_voting_deadline_locked");
    expect(submitFunction).toContain("Voting is not open for ballot changes.");
    expect(submitFunction).toContain("has_tournament_history = true");
    expect(submitFunction).toContain("pg_advisory_xact_lock");
    expect(submitFunction).toContain("v_now + interval '30 seconds'");
    expect(submitFunction).not.toContain("least(coalesce(closes_at");
    expect(migrations).toContain("voter_device_bindings");
    expect(migrations).toContain("normalized_submit_ballot_without_device_binding_20260713");
    expect(migrations).toContain("already registered to a different start.gg username");
    expect(submitFunction?.indexOf("normalized_apply_voting_deadline_locked")).toBeLessThan(
      submitFunction?.indexOf("Voting is not open for ballot changes.") ?? 0,
    );
    expect(computeFunction).toContain("normalized_apply_voting_deadline_locked");
    expect(computeFunction).toContain("insert into public.result_snapshots");
    expect(computeFunction).toContain("insert into public.result_rows");
    expect(computeFunction).toContain("insert into public.tiebreaks");
    expect(migrations).toContain("validate_result_snapshot_draw_freshness");
    expect(migrations).toContain("validate_round_draws_against_prior_selected_songs");
    expect(computeFunction).toContain("join public.round_player_eligibility as eligibility");
    expect(computeFunction).toContain("eligibility.player_id is not null");
    expect(computeFunction).not.toContain("normalized_runtime_transaction_ack");
    expect(computeFunction).not.toContain("normalized_runtime_transaction_disabled");
  });

  it("implements voter presence as a row-scoped service-role transaction", () => {
    const migrations = readMigrations();
    const claimFunction = latestRpcDefinition(migrations, "normalized_claim_voter_presence");

    expect(claimFunction).not.toBe("");
    expect(claimFunction).toContain("normalized_assert_voter_device_available");
    expect(claimFunction).toContain(
      "normalized_claim_voter_presence_without_device_binding_20260713",
    );
    expect(migrations).toContain("round_player_eligibility");
    expect(migrations).toContain("active_voter_presence");
    expect(migrations).toContain("on conflict (event_id, round_number, player_id, device_id)");
    expect(claimFunction).not.toContain("normalized_runtime_transaction_disabled");
    expect(claimFunction).not.toContain("normalized_runtime_transaction_ack");
  });

  it("implements durable voting timer advancement as a database-time transaction", () => {
    const migrations = readMigrations();
    const timerFunction = latestRpcDefinition(migrations, "normalized_advance_voting_timer");
    const timerDefinitions = rpcDefinitions(migrations, "normalized_advance_voting_timer")
      .slice(-2)
      .join("\n");

    expect(timerFunction).not.toBe("");
    expect(timerFunction).toContain("normalized_database_time");
    expect(timerFunction).toContain("pg_advisory_xact_lock");
    expect(timerFunction).toContain("normalized_refresh_public_state_generation");
    expect(timerDefinitions).toContain("normalized_apply_voting_deadline_locked");
    expect(timerDefinitions).toContain("'rows_changed'");
    expect(timerDefinitions).toContain("'changed'");
    expect(timerFunction).not.toContain("normalized_runtime_transaction_disabled");
    expect(timerFunction).not.toContain("normalized_runtime_transaction_ack");
  });

  it("implements emergency admin workflow RPCs as row-changing service-role transactions", () => {
    const migrations = readMigrations();
    const combinedDefinitions = (name: string) =>
      rpcDefinitions(migrations, name).slice(-2).join("\n");
    const manualFunction = combinedDefinitions("normalized_manual_ballot_override");
    const reopenFunction = combinedDefinitions("normalized_reopen_voting_window");
    const closeFunction = combinedDefinitions("normalized_close_voting_window");
    const resetFunction = combinedDefinitions("normalized_reset_round");

    for (const definition of [manualFunction, reopenFunction, closeFunction, resetFunction]) {
      expect(definition).not.toBe("");
      expect(definition).toContain("normalized_database_time");
      expect(definition).toContain("pg_advisory_xact_lock");
      expect(definition).toContain("insert into public.admin_actions");
      expect(definition).toContain("normalized_refresh_public_state_generation");
      expect(definition).not.toContain("normalized_runtime_transaction_disabled");
      expect(definition).not.toContain("normalized_runtime_transaction_ack");
      expect(definition).not.toContain("adminPassword");
    }

    expect(manualFunction).toContain("replaceExistingBallot");
    expect(manualFunction).toContain("'manual_admin'");
    expect(manualFunction).toContain("delete from public.result_snapshots");
    expect(manualFunction).toContain("override_reason");
    expect(reopenFunction).toContain("status = 'voting_open'");
    expect(reopenFunction).toContain("delete from public.result_snapshots");
    expect(closeFunction).toContain("status = 'voting_closed'");
    expect(closeFunction).toContain("'close_voting'");
    expect(closeFunction).toContain("from public.host_locks");
    expect(closeFunction).toContain("host_lock.lock_name = 'tournament-host'");
    expect(closeFunction).toContain("Host control is required for this action.");
    expect(resetFunction).toContain("delete from public.ballot_revisions");
    expect(resetFunction).toContain("delete from public.ballots");
    expect(resetFunction).toContain("delete from public.voting_windows");
    expect(resetFunction).toContain("delete from public.round_player_eligibility");
    expect(resetFunction).toContain("delete from public.draws");
    expect(resetFunction).not.toContain("delete from public.admin_actions");
    expect(resetFunction).not.toContain("delete from public.players");
  });

  it("implements the Phase 3 host lifecycle atomically without expiry-based authority", () => {
    const migration = readPhase3Migration();
    const acquire = latestRpcDefinition(migration, "normalized_acquire_host_lock");
    const heartbeat = latestRpcDefinition(migration, "normalized_heartbeat_host_lock");
    const release = latestRpcDefinition(migration, "normalized_release_host_lock");
    const close = latestRpcDefinition(migration, "normalized_close_voting_window");

    for (const definition of [acquire, heartbeat, release]) {
      expect(definition).not.toBe("");
      expect(definition).toContain("pg_advisory_xact_lock");
      expect(definition).toContain("hostTokenHash");
      expect(definition).not.toContain("normalized_runtime_transaction_disabled");
      expect(definition).not.toMatch(/host_lock\.expires_at\s*>\s*v_now/);
    }

    expect(acquire).toContain("for update");
    expect(acquire).toContain("admin_sessions");
    expect(acquire).toContain("v_mode not in ('take', 'restore', 'force')");
    expect(acquire).toContain("reason is required for forced host takeover");
    expect(acquire).toContain("v_expected_host_token_hash");
    expect(acquire).toContain("Recovery proof is stale for the active host credential");
    expect(acquire).toContain("v_lock.acquired_at + interval '1 microsecond'");
    expect(acquire).toContain("acquired_at = v_next_acquired_at");
    expect(acquire).toContain("insert into public.admin_actions");
    expect(acquire).toContain("'dangerous', v_dangerous");
    expect(heartbeat).toContain("normalized_assert_phase1_host");
    expect(heartbeat).not.toContain("insert into public.admin_actions");
    expect(release).toContain("normalized_assert_phase1_host");
    expect(release).toContain("admin_sessions");
    expect(release).toContain("delete from public.host_locks");
    expect(release).toContain("insert into public.admin_actions");
    expect(close).toContain("v_host_token_hash");
    expect(close).toContain("normalized_assert_phase1_host");
    expect(close).not.toMatch(/host_lock\.expires_at\s*>/);

    for (const rpcName of [
      "normalized_acquire_host_lock",
      "normalized_heartbeat_host_lock",
      "normalized_release_host_lock",
      "normalized_close_voting_window",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${rpcName}\\(text, jsonb\\)[\\s\\S]*?from public, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(migration).toMatch(
        new RegExp(
          `grant execute on function public\\.${rpcName}\\(text, jsonb\\) to service_role`,
          "i",
        ),
      );
    }
  });

  it("keeps every Phase 1 administrative wrapper host-verified, generation-checked, and idempotent", () => {
    const migration = readPhase1Migration();
    const wrapperNames = [
      "normalized_compute_results",
      "normalized_pause_voting_window",
      "normalized_resume_voting_window",
      "normalized_reopen_voting_window",
      "normalized_reset_round",
      "normalized_open_voting_window",
    ];

    for (const functionName of wrapperNames) {
      const definition = phase1FunctionDefinition(migration, functionName);

      expect(definition, `${functionName} should exist in the Phase 1 migration`).not.toBe("");
      expect(definition, `${functionName} should verify the active host`).toContain(
        "normalized_assert_phase1_host",
      );
      expect(definition, `${functionName} should parse expectedGeneration`).toContain(
        "v_expected_generation",
      );
      expect(definition, `${functionName} should reject stale generations`).toContain(
        "v_projection.generation <> v_expected_generation",
      );
      expect(definition, `${functionName} should require requestId`).toContain("v_request_id");
      expect(definition, `${functionName} should deduplicate committed requests`).toContain(
        "action.mutation_request_id = v_request_id",
      );
    }
  });

  it("keeps rollback compatibility mutations owned by the active host in the transaction", () => {
    const migration = readPhase1Migration();
    const wrappers = [
      {
        name: "normalized_compute_results",
        legacyCall: "normalized_compute_results_without_phase1_projection_20260713",
      },
      {
        name: "normalized_reopen_voting_window",
        legacyCall: "normalized_reopen_voting_window_pre_phase1_20260713",
      },
      {
        name: "normalized_reset_round",
        legacyCall: "normalized_reset_round_without_phase1_projection_20260713",
      },
    ];

    expect(migration).toContain(
      "create or replace function public.normalized_assert_phase1_legacy_host_owner",
    );
    expect(migration).toContain("session.revoked_at is null");
    expect(migration).toContain("session.expires_at > p_now");
    expect(migration).toContain("host_lock.released_at is null");

    for (const wrapper of wrappers) {
      const definition = phase1FunctionDefinition(migration, wrapper.name);
      const legacyHostCheck = definition.indexOf("normalized_assert_phase1_legacy_host_owner");
      const legacyMutation = definition.indexOf(wrapper.legacyCall);

      expect(
        legacyHostCheck,
        `${wrapper.name} should verify legacy host ownership`,
      ).toBeGreaterThan(-1);
      expect(
        legacyHostCheck,
        `${wrapper.name} should verify before the legacy mutation`,
      ).toBeLessThan(legacyMutation);
    }
  });

  it("commits pause and resume window state with their public generation", () => {
    const migration = readPhase1Migration();
    const pause = phase1FunctionDefinition(migration, "normalized_pause_voting_window");
    const resume = phase1FunctionDefinition(migration, "normalized_resume_voting_window");

    expect(pause).toContain("status = 'voting_paused'");
    expect(pause).toContain("remaining_ms_when_paused = v_remaining_ms");
    expect(pause.indexOf("update public.voting_windows")).toBeLessThan(
      pause.indexOf("normalized_refresh_public_state_generation"),
    );
    expect(pause).toContain("'voting_paused'");

    expect(resume).toContain("set status = v_resume_status");
    expect(resume).toContain("remaining_ms_when_paused = null");
    expect(resume.indexOf("update public.voting_windows")).toBeLessThan(
      resume.indexOf("normalized_refresh_public_state_generation"),
    );
    expect(resume).toContain("'voting_resumed'");
  });

  it("preserves the round eligibility snapshot through reroll and reuses it when voting restarts", () => {
    const migration = readPhase1Migration();
    const rerollFunction = phase1FunctionDefinition(migration, "normalized_apply_phase1_reroll");
    const openVotingFunction = phase1FunctionDefinition(migration, "normalized_open_voting_window");

    expect(rerollFunction).not.toContain("delete from public.round_player_eligibility");
    expect(rerollFunction).toContain("Preserved from the pre-reroll voting-window eligibility");
    expect(rerollFunction.indexOf("insert into public.round_player_eligibility")).toBeLessThan(
      rerollFunction.indexOf("delete from public.voting_windows"),
    );
    expect(openVotingFunction).toContain("v_has_eligibility_snapshot");
    expect(openVotingFunction).toContain("and v_has_eligibility_snapshot");
    expect(openVotingFunction).toContain("if not v_has_eligibility_snapshot then");
    expect(openVotingFunction).toContain("Captured when voting opened.");
    expect(openVotingFunction).not.toContain("eligibility.active_at_round_start = false");
    expect(migration).toContain("Backfilled from the durable voting-window eligibility snapshot.");
  });

  it("keeps replacement chart catalog insertion inside the atomic reroll transaction", () => {
    const rerollFunction = phase1FunctionDefinition(
      readPhase1Migration(),
      "normalized_apply_phase1_reroll",
    );

    expect(rerollFunction).toContain("insert into public.charts");
    expect(rerollFunction).toContain("on conflict (id) do nothing");
    expect(rerollFunction).toContain(
      "Replacement chart metadata conflicts with the canonical chart catalog",
    );
    expect(rerollFunction.indexOf("normalized_assert_phase1_host")).toBeLessThan(
      rerollFunction.indexOf("insert into public.charts"),
    );
    expect(rerollFunction.indexOf("insert into public.charts")).toBeLessThan(
      rerollFunction.indexOf("insert into public.draws"),
    );
  });

  it("rejects opening voting when the round already has a window or result snapshot", () => {
    const openVotingFunction = phase1FunctionDefinition(
      readPhase1Migration(),
      "normalized_open_voting_window",
    );

    expect(openVotingFunction).toContain("from public.voting_windows as voting_window");
    expect(openVotingFunction).toContain("Voting has already opened for this round.");
    expect(openVotingFunction).toContain("from public.result_snapshots as result_snapshot");
    expect(openVotingFunction).toContain(
      "Round results must be reset before voting can open again.",
    );
    expect(openVotingFunction).not.toContain("status = 'round_complete'");
  });

  it("persists normalized draw state through one transactional RPC", () => {
    const migrations = readMigrations();
    const drawPersistFunctions = [
      ...migrations.matchAll(
        /create or replace function public\.normalized_replace_draw_state\(p_event_id text, p_payload jsonb\)[\s\S]*?grant execute on function public\.normalized_replace_draw_state\(text, jsonb\) to service_role;/gi,
      ),
    ];
    const drawPersistFunction = drawPersistFunctions.at(-1)?.[0] ?? "";
    const repositorySource = readFileSync(
      path.join(process.cwd(), "src/lib/server/normalized-operational-state.ts"),
      "utf8",
    );
    const deleteBatchDeclaration =
      repositorySource.match(/const EVENT_TABLE_DELETE_BATCHES[\s\S]*?\n];/)?.[0] ?? "";

    expect(drawPersistFunction).toContain("delete from public.drawn_charts");
    expect(drawPersistFunction).toContain("insert into public.draws");
    expect(drawPersistFunction).toContain("insert into public.drawn_charts");
    expect(drawPersistFunction).toContain(
      "revoke execute on function public.normalized_replace_draw_state",
    );
    expect(repositorySource).toContain('"normalized_replace_draw_state"');
    expect(deleteBatchDeclaration).not.toContain('"draws"');
    expect(deleteBatchDeclaration).not.toContain('"drawn_charts"');
    expect(deleteBatchDeclaration).not.toContain('"host_locks"');
  });

  it("locks down tournament-changing RPC execute privileges", () => {
    const migrations = readMigrations();

    for (const rpcName of Object.values(NORMALIZED_ALL_RUNTIME_RPC_NAMES)) {
      expect(migrations).toMatch(
        new RegExp(
          `revoke execute on function public\\.${rpcName}\\s*\\(text, jsonb\\) from public, anon, authenticated`,
          "i",
        ),
      );
      expect(migrations).toMatch(
        new RegExp(
          `grant execute on function public\\.${rpcName}\\s*\\(text, jsonb\\) to service_role`,
          "i",
        ),
      );
    }
  });
});
