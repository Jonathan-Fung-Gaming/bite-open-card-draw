import "server-only";
import { z } from "zod";
import type { Database, Json } from "@/lib/db/database.types";
import { getTournamentEventId } from "@/lib/server/env";
import {
  closeVotingWindowInputSchema,
  drawRoundSetInputSchema,
  manualBallotOverrideInputSchema,
  overrideResultInputSchema,
  submitBallotInputSchema,
} from "@/lib/server/mutation-contracts";
import { invalidateTournamentReadCaches } from "@/lib/server/public-hydration-cache";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type NormalizedRuntimeRpcName = keyof Database["public"]["Functions"];

type RpcError = {
  message: string;
};

type RpcClient = {
  rpc(
    functionName: NormalizedRuntimeRpcName,
    args: Record<string, Json>,
  ): Promise<{
    data: Json | null;
    error: RpcError | null;
  }>;
};

type TransactionDependencies = {
  eventId?: string;
  supabase?: RpcClient;
};

const uuidSchema = z.string().uuid();
const isoDateTimeSchema = z.string().datetime({ offset: true });
const publicGenerationSchema = z.number().int().nonnegative();
const hostTokenHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

const PHASE1_CAPABILITY_GATED_MUTATIONS = new Set<NormalizedTransactionalMutationName>([
  "submitBallot",
  "computeResults",
  "pauseVotingWindow",
  "resumeVotingWindow",
  "reopenVotingWindow",
  "resetRound",
  "openVotingWindow",
  "rerollOneChart",
  "rerollRoundSet",
  "rerollFullRound",
  "advanceResultReveal",
  "markResultsRevealed",
]);

const normalizedAdminTransitionSchema = z.object({
  requestId: uuidSchema,
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  adminSessionId: uuidSchema,
  hostTokenHash: hostTokenHashSchema,
  expectedGeneration: publicGenerationSchema,
});

const normalizedNextDrawSchema = z.object({
  id: uuidSchema,
  roundSetId: uuidSchema,
  version: z.number().int().positive(),
  eligiblePoolCount: z.number().int().nonnegative(),
  eligibleChartIds: z.array(uuidSchema),
  excludedChartKeysSnapshot: z.array(z.string()),
  selectedSongKeysSnapshot: z.array(z.string()),
  sameRoundBlockedSongKeysSnapshot: z.array(z.string()),
  charts: z
    .array(
      z.object({
        id: uuidSchema,
        name: z.string().trim().min(1),
        artist: z.string().trim().min(1),
        displayDifficulty: z.string().regex(/^[SD]\d{1,2}$/),
        songKey: z.string().trim().min(1),
        chartKey: z.string().trim().min(1),
        sourceBgImg: z.string(),
        localImagePath: z.string().nullable(),
      }),
    )
    .length(7),
});

const normalizedRerollDrawSchema = z
  .object({
    expectedDrawId: uuidSchema,
    expectedDrawVersion: z.number().int().positive(),
    nextDraw: normalizedNextDrawSchema,
  })
  .superRefine((value, context) => {
    if (value.nextDraw.version !== value.expectedDrawVersion + 1) {
      context.addIssue({
        code: "custom",
        message: "Next draw version must increment the expected draw version by one.",
        path: ["nextDraw", "version"],
      });
    }
  });

const normalizedRerollBaseSchema = normalizedAdminTransitionSchema.extend({
  reason: z.string().trim().min(1),
});

const normalizedRerollOneChartSchema = normalizedRerollBaseSchema.extend({
  targetChartId: uuidSchema,
  draws: z.array(normalizedRerollDrawSchema).length(1),
});

const normalizedRerollRoundSetSchema = normalizedRerollBaseSchema.extend({
  draws: z.array(normalizedRerollDrawSchema).length(1),
});

const normalizedRerollFullRoundSchema = normalizedRerollBaseSchema.extend({
  draws: z.array(normalizedRerollDrawSchema).length(2),
});

const normalizedAdvanceResultRevealSchema = normalizedAdminTransitionSchema.extend({
  expectedResultId: uuidSchema,
  expectedRevealPhase: z.enum([
    "computed",
    "set_1_counts",
    "set_1_resolved",
    "set_2_counts",
    "set_2_resolved",
  ]),
});

const normalizedMarkResultsRevealedSchema = normalizedAdminTransitionSchema.extend({
  expectedResultId: uuidSchema,
  expectedRevealPhase: z.literal("final"),
});

const activeVoterPresenceInputSchema = z.object({
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  playerId: uuidSchema,
  deviceId: z.string().trim().min(8),
  expiresAt: isoDateTimeSchema,
  userAgent: z.string().trim().optional(),
});

const advanceVotingTimerInputSchema = z.object({
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  serverNow: isoDateTimeSchema.optional(),
});

const postVoteRerollInvalidationInputSchema = z.object({
  roundNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  adminActionId: uuidSchema.optional(),
  reason: z.string().trim().min(1),
});

const normalizedManualBallotOverrideInputSchema = manualBallotOverrideInputSchema
  .omit({ adminPassword: true })
  .extend({
    adminSessionId: uuidSchema,
  });

const normalizedReopenVotingWindowInputSchema = normalizedAdminTransitionSchema.extend({
  durationMinutes: z.number().int().min(1).max(10),
  reason: z.string().trim().min(1),
});

const normalizedResetRoundInputSchema = normalizedAdminTransitionSchema.extend({
  reason: z.string().trim().min(1),
});

const normalizedCloseVotingWindowInputSchema = closeVotingWindowInputSchema.extend({
  adminSessionId: uuidSchema,
  hostTokenHash: hostTokenHashSchema,
});

const normalizedHostLockCredentialSchema = z.object({
  requestId: uuidSchema,
  adminSessionId: uuidSchema,
  hostTokenHash: hostTokenHashSchema,
});

const normalizedAcquireHostLockInputSchema = normalizedHostLockCredentialSchema
  .extend({
    mode: z.enum(["take", "restore", "force"]),
    expectedHostTokenHash: hostTokenHashSchema.nullable().optional(),
    recoveryOwnerSessionId: z.string().trim().min(1).nullable().optional(),
    reason: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "force" && !value.reason) {
      context.addIssue({
        code: "custom",
        message: "Forced host takeover requires an audit reason.",
        path: ["reason"],
      });
    }

    if (value.mode === "restore" && !value.expectedHostTokenHash) {
      context.addIssue({
        code: "custom",
        message: "Restore requires the expected active host credential hash.",
        path: ["expectedHostTokenHash"],
      });
    }
  });

const normalizedHeartbeatHostLockInputSchema = normalizedHostLockCredentialSchema;
const normalizedReleaseHostLockInputSchema = normalizedHostLockCredentialSchema;

const adminSessionCreateInputSchema = z.object({
  sessionTokenHash: z.string().trim().min(16),
  expiresAt: isoDateTimeSchema,
});

const adminSessionTouchInputSchema = z.object({
  sessionId: uuidSchema,
  expiresAt: isoDateTimeSchema,
});

const adminSessionEndInputSchema = z.object({
  sessionId: uuidSchema,
});

export const NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS = {
  claimActiveVoterPresence: activeVoterPresenceInputSchema,
  submitBallot: submitBallotInputSchema.extend({
    expectedGeneration: publicGenerationSchema,
  }),
  computeResults: normalizedAdminTransitionSchema,
  advanceVotingTimer: advanceVotingTimerInputSchema,
  pauseVotingWindow: normalizedAdminTransitionSchema,
  resumeVotingWindow: normalizedAdminTransitionSchema,
  closeVotingWindow: normalizedCloseVotingWindowInputSchema,
  manualBallotOverride: normalizedManualBallotOverrideInputSchema,
  reopenVotingWindow: normalizedReopenVotingWindowInputSchema,
  resetRound: normalizedResetRoundInputSchema,
  openVotingWindow: normalizedAdminTransitionSchema,
  rerollOneChart: normalizedRerollOneChartSchema,
  rerollRoundSet: normalizedRerollRoundSetSchema,
  rerollFullRound: normalizedRerollFullRoundSchema,
  advanceResultReveal: normalizedAdvanceResultRevealSchema,
  markResultsRevealed: normalizedMarkResultsRevealedSchema,
  acquireHostLock: normalizedAcquireHostLockInputSchema,
  refreshHostLock: normalizedHeartbeatHostLockInputSchema,
  releaseHostLock: normalizedReleaseHostLockInputSchema,
} as const;

export const NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATION_SCHEMAS = {
  touchActiveVoterPresence: activeVoterPresenceInputSchema,
  drawRoundSet: drawRoundSetInputSchema,
  postVoteRerollInvalidation: postVoteRerollInvalidationInputSchema,
  overrideResult: overrideResultInputSchema,
  adminSessionCreate: adminSessionCreateInputSchema,
  adminSessionTouch: adminSessionTouchInputSchema,
  adminSessionLogout: adminSessionEndInputSchema,
  adminSessionRevoke: adminSessionEndInputSchema,
} as const;

export type NormalizedTransactionalMutationName =
  keyof typeof NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS;
export type NormalizedBlockedTransactionalMutationName =
  keyof typeof NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATION_SCHEMAS;
export type NormalizedRuntimeMutationName =
  NormalizedTransactionalMutationName | NormalizedBlockedTransactionalMutationName;

export type NormalizedTransactionalMutationInput<
  TName extends NormalizedTransactionalMutationName,
> = z.input<(typeof NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS)[TName]>;

export const NORMALIZED_RUNTIME_RPC_NAMES = {
  claimActiveVoterPresence: "normalized_claim_voter_presence",
  submitBallot: "normalized_submit_ballot",
  computeResults: "normalized_compute_results",
  advanceVotingTimer: "normalized_advance_voting_timer",
  pauseVotingWindow: "normalized_pause_voting_window",
  resumeVotingWindow: "normalized_resume_voting_window",
  closeVotingWindow: "normalized_close_voting_window",
  manualBallotOverride: "normalized_manual_ballot_override",
  reopenVotingWindow: "normalized_reopen_voting_window",
  resetRound: "normalized_reset_round",
  openVotingWindow: "normalized_open_voting_window",
  rerollOneChart: "normalized_reroll_one_chart",
  rerollRoundSet: "normalized_reroll_round_set",
  rerollFullRound: "normalized_reroll_full_round",
  advanceResultReveal: "normalized_advance_result_reveal",
  markResultsRevealed: "normalized_mark_results_revealed",
  acquireHostLock: "normalized_acquire_host_lock",
  refreshHostLock: "normalized_heartbeat_host_lock",
  releaseHostLock: "normalized_release_host_lock",
} as const satisfies Record<NormalizedTransactionalMutationName, NormalizedRuntimeRpcName>;

export const NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES = {
  touchActiveVoterPresence: "normalized_touch_voter_presence",
  drawRoundSet: "normalized_draw_round_set",
  postVoteRerollInvalidation: "normalized_invalidate_post_vote_reroll_ballots",
  overrideResult: "normalized_override_result",
  adminSessionCreate: "normalized_create_admin_session",
  adminSessionTouch: "normalized_touch_admin_session",
  adminSessionLogout: "normalized_logout_admin_session",
  adminSessionRevoke: "normalized_revoke_admin_session",
} as const satisfies Record<NormalizedBlockedTransactionalMutationName, NormalizedRuntimeRpcName>;

export const NORMALIZED_ALL_RUNTIME_RPC_NAMES = {
  ...NORMALIZED_RUNTIME_RPC_NAMES,
  ...NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES,
} as const satisfies Record<NormalizedRuntimeMutationName, NormalizedRuntimeRpcName>;

export const NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATIONS = Object.fromEntries(
  Object.entries(NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES).map(([name, rpcName]) => [
    name,
    {
      rpcName,
      reason:
        "This normalized RPC is currently disabled in migrations and must not be used as an advertised transaction boundary until implemented.",
    },
  ]),
) as Record<
  NormalizedBlockedTransactionalMutationName,
  {
    rpcName: NormalizedRuntimeRpcName;
    reason: string;
  }
>;

export function isNormalizedTransactionalMutationImplemented(
  name: NormalizedRuntimeMutationName,
): name is NormalizedTransactionalMutationName {
  return name in NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS;
}

export function getNormalizedTransactionalMutationBlockedMessage(
  name: NormalizedRuntimeMutationName,
) {
  if (isNormalizedTransactionalMutationImplemented(name)) {
    return null;
  }

  const blocked = NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATIONS[name];

  return `Normalized runtime mutation ${name} is blocked: ${blocked.reason}`;
}

export function assertNormalizedTransactionalMutationImplemented(
  name: NormalizedRuntimeMutationName,
): asserts name is NormalizedTransactionalMutationName {
  const blockedMessage = getNormalizedTransactionalMutationBlockedMessage(name);

  if (blockedMessage) {
    throw new Error(blockedMessage);
  }
}

function createRpcClient() {
  return createServiceRoleSupabaseClient() as unknown as RpcClient;
}

function isPlaceholderCommitAck(data: Json | null) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  const record = data as Record<string, unknown>;

  return (
    record.committed === true &&
    !("rows_changed" in record) &&
    !("changed_rows" in record) &&
    !("generation" in record) &&
    !("adminActionId" in record)
  );
}

async function assertPhase1MutationCapability(
  name: NormalizedTransactionalMutationName,
  eventId: string,
  supabase: RpcClient,
) {
  if (!PHASE1_CAPABILITY_GATED_MUTATIONS.has(name)) {
    return;
  }

  const { data, error } = await supabase.rpc("normalized_read_public_generation_key", {
    p_event_id: eventId,
  });

  if (error) {
    throw new Error(
      `Normalized runtime mutation ${name} is unavailable until the Phase 1 database migration is applied: ${error.message}`,
    );
  }

  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof (data as Record<string, unknown>).generationKey !== "string"
  ) {
    throw new Error(
      `Normalized runtime mutation ${name} is unavailable because the Phase 1 capability preflight returned an invalid response.`,
    );
  }
}

export async function executeNormalizedTransactionalMutation<
  TName extends NormalizedTransactionalMutationName,
>(
  name: TName,
  input: NormalizedTransactionalMutationInput<TName>,
  dependencies: TransactionDependencies = {},
) {
  const mutationName = name as NormalizedRuntimeMutationName;

  if (!(mutationName in NORMALIZED_ALL_RUNTIME_RPC_NAMES)) {
    throw new Error(`Unknown normalized runtime mutation ${mutationName}.`);
  }

  assertNormalizedTransactionalMutationImplemented(mutationName);

  const payload = NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS[name].parse(input) as Json;
  const eventId = dependencies.eventId ?? getTournamentEventId();
  const supabase = dependencies.supabase ?? createRpcClient();
  const rpcName = NORMALIZED_RUNTIME_RPC_NAMES[name];
  await assertPhase1MutationCapability(name, eventId, supabase);
  const { data, error } = await supabase.rpc(rpcName, {
    p_event_id: eventId,
    p_payload: payload,
  });

  if (error) {
    throw new Error(`Normalized runtime mutation ${name} failed: ${error.message}`);
  }

  if (isPlaceholderCommitAck(data)) {
    throw new Error(
      `Normalized runtime mutation ${name} returned a placeholder commit acknowledgement without row changes.`,
    );
  }

  invalidateTournamentReadCaches();

  return data;
}
