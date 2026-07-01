import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Json } from "@/lib/db/database.types";
import {
  executeNormalizedTransactionalMutation,
  NORMALIZED_RUNTIME_RPC_NAMES,
  NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS,
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

const requiredMutationNames: NormalizedTransactionalMutationName[] = [
  "submitBallot",
  "manualBallotOverride",
  "claimActiveVoterPresence",
  "touchActiveVoterPresence",
  "acquireHostLock",
  "refreshHostLock",
  "releaseHostLock",
  "openVotingWindow",
  "pauseVotingWindow",
  "resumeVotingWindow",
  "closeVotingWindow",
  "reopenVotingWindow",
  "advanceVotingTimer",
  "drawRoundSet",
  "rerollOneChart",
  "rerollRoundSet",
  "rerollFullRound",
  "postVoteRerollInvalidation",
  "computeResults",
  "advanceResultReveal",
  "markResultsRevealed",
  "overrideResult",
  "resetRound",
  "adminSessionCreate",
  "adminSessionTouch",
  "adminSessionLogout",
  "adminSessionRevoke",
];

function readMigrations() {
  const migrationsDirectory = path.join(process.cwd(), "supabase/migrations");

  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(path.join(migrationsDirectory, fileName), "utf8"))
    .join("\n");
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
    expect(Object.keys(NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS)).toEqual(requiredMutationNames);
    expect(Object.keys(NORMALIZED_RUNTIME_RPC_NAMES)).toEqual(requiredMutationNames);
  });

  it("has a Supabase RPC function for every transactional mutation", () => {
    const migrations = readMigrations();

    for (const rpcName of Object.values(NORMALIZED_RUNTIME_RPC_NAMES)) {
      expect(migrations).toMatch(
        new RegExp(
          `function public\\.${rpcName}\\s*\\(\\s*p_event_id text,\\s*p_payload jsonb\\s*\\)`,
          "i",
        ),
      );
    }
  });

  it("validates input and executes the mapped RPC with the configured event id", async () => {
    const calls: RpcCall[] = [];
    const result = await executeNormalizedTransactionalMutation(
      "submitBallot",
      {
        roundNumber: 1,
        playerId: uuidA,
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
            choices: [
              { drawId: uuidB, roundSetId: uuidA, noBans: false, bannedChartIds: [uuidC] },
              { drawId: uuidC, roundSetId: uuidB, noBans: true, bannedChartIds: [] },
            ],
          },
        },
      },
    ]);
  });

  it("uses TOURNAMENT_EVENT_ID when no explicit event id is passed", async () => {
    const calls: RpcCall[] = [];

    vi.stubEnv("TOURNAMENT_EVENT_ID", "env-event");

    await executeNormalizedTransactionalMutation(
      "adminSessionLogout",
      { sessionId: uuidA },
      { supabase: createMockRpcClient(calls) },
    );

    expect(calls[0]?.args.p_event_id).toBe("env-event");
  });

  it("does not call RPC when validation fails", async () => {
    const calls: RpcCall[] = [];

    await expect(
      executeNormalizedTransactionalMutation(
        "claimActiveVoterPresence",
        { playerId: uuidA, deviceId: "short", expiresAt: "not-a-date" },
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
        "adminSessionLogout",
        { sessionId: uuidA },
        {
          eventId: "event-a",
          supabase: createMockRpcClient([], {
            data: null,
            error: { message: "transaction failed" },
          }),
        },
      ),
    ).rejects.toThrow(/adminSessionLogout failed: transaction failed/);
  });

  it("rejects placeholder commit acknowledgements that do not prove rows changed", async () => {
    await expect(
      executeNormalizedTransactionalMutation(
        "submitBallot",
        {
          roundNumber: 1,
          playerId: uuidA,
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
    expect(submitFunction).toContain("pg_advisory_xact_lock");
    expect(submitFunction).toContain("v_now + interval '30 seconds'");
    expect(submitFunction).not.toContain("least(coalesce(closes_at");
    expect(submitFunction?.indexOf("normalized_apply_voting_deadline_locked")).toBeLessThan(
      submitFunction?.indexOf("Voting is not open for ballot changes.") ?? 0,
    );
    expect(computeFunction).toContain("normalized_apply_voting_deadline_locked");
    expect(computeFunction).toContain("insert into public.result_snapshots");
    expect(computeFunction).toContain("insert into public.result_rows");
    expect(computeFunction).toContain("insert into public.tiebreaks");
    expect(computeFunction).not.toContain("normalized_runtime_transaction_ack");
    expect(computeFunction).not.toContain("normalized_runtime_transaction_disabled");
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

    for (const rpcName of Object.values(NORMALIZED_RUNTIME_RPC_NAMES)) {
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
