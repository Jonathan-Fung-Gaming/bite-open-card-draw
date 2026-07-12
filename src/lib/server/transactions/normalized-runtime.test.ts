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

type TransactionDependencies = NonNullable<
  Parameters<typeof executeNormalizedTransactionalMutation>[2]
>;
type MockRpcClient = NonNullable<TransactionDependencies["supabase"]>;
type RpcFunctionName = (typeof NORMALIZED_RUNTIME_RPC_NAMES)[NormalizedTransactionalMutationName];

type RpcCall = {
  functionName: RpcFunctionName;
  args: {
    p_event_id: string;
    p_payload: Json;
  };
};

const implementedMutationNames: NormalizedTransactionalMutationName[] = [
  "claimActiveVoterPresence",
  "submitBallot",
  "computeResults",
  "advanceVotingTimer",
  "closeVotingWindow",
  "manualBallotOverride",
  "reopenVotingWindow",
  "resetRound",
];

const blockedMutationNames: NormalizedBlockedTransactionalMutationName[] = [
  "touchActiveVoterPresence",
  "acquireHostLock",
  "refreshHostLock",
  "releaseHostLock",
  "openVotingWindow",
  "pauseVotingWindow",
  "resumeVotingWindow",
  "drawRoundSet",
  "rerollOneChart",
  "rerollRoundSet",
  "rerollFullRound",
  "postVoteRerollInvalidation",
  "advanceResultReveal",
  "markResultsRevealed",
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

function latestRpcDefinition(migrations: string, rpcName: string) {
  const matches = [
    ...migrations.matchAll(
      new RegExp(
        `create or replace function public\\.${rpcName}\\s*\\(\\s*p_event_id text,\\s*p_payload jsonb\\s*\\)[\\s\\S]*?(?=\\ncreate or replace function public\\.|\\nrevoke execute on function public\\.|$)`,
        "gi",
      ),
    ),
  ];

  return matches.at(-1)?.[0] ?? "";
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
        functionName: functionName as RpcFunctionName,
        args,
      });

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
        functionName: "normalized_submit_ballot",
        args: {
          p_event_id: "event-a",
          p_payload: {
            roundNumber: 1,
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
      },
      {
        eventId: "event-a",
        supabase: createMockRpcClient(calls),
      },
    );

    await executeNormalizedTransactionalMutation(
      "resetRound",
      {
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
      "normalized_reopen_voting_window",
      "normalized_close_voting_window",
      "normalized_reset_round",
    ]);
    for (const call of calls) {
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
      { roundNumber: 1 },
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
        { roundNumber: 1 },
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

  it("rejects placeholder commit acknowledgements that do not prove rows changed", async () => {
    await expect(
      executeNormalizedTransactionalMutation(
        "submitBallot",
        {
          roundNumber: 1,
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
    const computeFunctions = [
      ...migrations.matchAll(
        /create or replace function public\.normalized_compute_results\(p_event_id text, p_payload jsonb\)[\s\S]*?grant execute on function public\.normalized_compute_results\(text, jsonb\) to service_role;/gi,
      ),
    ];
    const submitFunction = submitFunctions.at(-1)?.[0];
    const computeFunction = computeFunctions.at(-1)?.[0];

    expect(migrations).not.toContain("least(v_closes_at, p_now + interval '30 seconds')");
    expect(submitFunction).toContain("normalized_apply_voting_deadline_locked");
    expect(submitFunction).toContain("Voting is not open for ballot changes.");
    expect(submitFunction).toContain("has_tournament_history = true");
    expect(submitFunction).toContain("pg_advisory_xact_lock");
    expect(submitFunction).toContain("v_now + interval '30 seconds'");
    expect(submitFunction).not.toContain("least(coalesce(closes_at");
    expect(migrations).toContain("voter_device_bindings");
    expect(migrations).toContain(
      "normalized_submit_ballot_without_device_binding_20260713",
    );
    expect(migrations).toContain(
      "already registered to a different start.gg username",
    );
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
    expect(migrations).toContain(
      "on conflict (event_id, round_number, player_id, device_id)",
    );
    expect(claimFunction).not.toContain("normalized_runtime_transaction_disabled");
    expect(claimFunction).not.toContain("normalized_runtime_transaction_ack");
  });

  it("implements durable voting timer advancement as a database-time transaction", () => {
    const migrations = readMigrations();
    const timerFunction = latestRpcDefinition(migrations, "normalized_advance_voting_timer");

    expect(timerFunction).not.toBe("");
    expect(timerFunction).toContain("normalized_database_time");
    expect(timerFunction).toContain("pg_advisory_xact_lock");
    expect(timerFunction).toContain("normalized_apply_voting_deadline_locked");
    expect(timerFunction).toContain("'rows_changed'");
    expect(timerFunction).toContain("'changed'");
    expect(timerFunction).not.toContain("normalized_runtime_transaction_disabled");
    expect(timerFunction).not.toContain("normalized_runtime_transaction_ack");
  });

  it("implements emergency admin workflow RPCs as row-changing service-role transactions", () => {
    const migrations = readMigrations();
    const manualFunction = latestRpcDefinition(migrations, "normalized_manual_ballot_override");
    const reopenFunction = latestRpcDefinition(migrations, "normalized_reopen_voting_window");
    const closeFunction = latestRpcDefinition(migrations, "normalized_close_voting_window");
    const resetFunction = latestRpcDefinition(migrations, "normalized_reset_round");

    for (const definition of [manualFunction, reopenFunction, closeFunction, resetFunction]) {
      expect(definition).not.toBe("");
      expect(definition).toContain("normalized_database_time");
      expect(definition).toContain("pg_advisory_xact_lock");
      expect(definition).toContain("insert into public.admin_actions");
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
    expect(drawPersistFunction).toContain("revoke execute on function public.normalized_replace_draw_state");
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
