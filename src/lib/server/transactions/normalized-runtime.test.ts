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
    data: { committed: true },
    error: null,
  },
): MockRpcClient {
  return {
    async rpc(functionName, args) {
      calls.push({
        functionName,
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

    expect(result).toEqual({ committed: true });
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
});
