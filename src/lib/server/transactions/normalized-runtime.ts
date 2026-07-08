import "server-only";
import { z } from "zod";
import type { Database, Json } from "@/lib/db/database.types";
import { getTournamentEventId } from "@/lib/server/env";
import {
  acquireHostLockInputSchema,
  advanceResultRevealInputSchema,
  closeVotingWindowInputSchema,
  computeResultsInputSchema,
  drawRoundSetInputSchema,
  manualBallotOverrideInputSchema,
  markResultsRevealedInputSchema,
  openVotingWindowInputSchema,
  overrideResultInputSchema,
  pauseVotingWindowInputSchema,
  releaseHostLockInputSchema,
  reopenVotingWindowInputSchema,
  rerollFullRoundInputSchema,
  rerollOneChartInputSchema,
  rerollRoundSetInputSchema,
  resetRoundInputSchema,
  resumeVotingWindowInputSchema,
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
    args: {
      p_event_id: string;
      p_payload: Json;
    },
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

const normalizedReopenVotingWindowInputSchema = reopenVotingWindowInputSchema
  .omit({ adminPassword: true })
  .extend({
    adminSessionId: uuidSchema,
  });

const normalizedResetRoundInputSchema = resetRoundInputSchema
  .omit({ adminPassword: true })
  .extend({
    adminSessionId: uuidSchema,
  });

const normalizedCloseVotingWindowInputSchema = closeVotingWindowInputSchema.extend({
  adminSessionId: uuidSchema,
});

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
  submitBallot: submitBallotInputSchema,
  computeResults: computeResultsInputSchema,
  advanceVotingTimer: advanceVotingTimerInputSchema,
  closeVotingWindow: normalizedCloseVotingWindowInputSchema,
  manualBallotOverride: normalizedManualBallotOverrideInputSchema,
  reopenVotingWindow: normalizedReopenVotingWindowInputSchema,
  resetRound: normalizedResetRoundInputSchema,
} as const;

export const NORMALIZED_BLOCKED_TRANSACTIONAL_MUTATION_SCHEMAS = {
  touchActiveVoterPresence: activeVoterPresenceInputSchema,
  acquireHostLock: acquireHostLockInputSchema,
  refreshHostLock: acquireHostLockInputSchema,
  releaseHostLock: releaseHostLockInputSchema,
  openVotingWindow: openVotingWindowInputSchema,
  pauseVotingWindow: pauseVotingWindowInputSchema,
  resumeVotingWindow: resumeVotingWindowInputSchema,
  drawRoundSet: drawRoundSetInputSchema,
  rerollOneChart: rerollOneChartInputSchema,
  rerollRoundSet: rerollRoundSetInputSchema,
  rerollFullRound: rerollFullRoundInputSchema,
  postVoteRerollInvalidation: postVoteRerollInvalidationInputSchema,
  advanceResultReveal: advanceResultRevealInputSchema,
  markResultsRevealed: markResultsRevealedInputSchema,
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
  | NormalizedTransactionalMutationName
  | NormalizedBlockedTransactionalMutationName;

export type NormalizedTransactionalMutationInput<
  TName extends NormalizedTransactionalMutationName,
> = z.input<(typeof NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS)[TName]>;

export const NORMALIZED_RUNTIME_RPC_NAMES = {
  claimActiveVoterPresence: "normalized_claim_voter_presence",
  submitBallot: "normalized_submit_ballot",
  computeResults: "normalized_compute_results",
  advanceVotingTimer: "normalized_advance_voting_timer",
  closeVotingWindow: "normalized_close_voting_window",
  manualBallotOverride: "normalized_manual_ballot_override",
  reopenVotingWindow: "normalized_reopen_voting_window",
  resetRound: "normalized_reset_round",
} as const satisfies Record<NormalizedTransactionalMutationName, NormalizedRuntimeRpcName>;

export const NORMALIZED_BLOCKED_RUNTIME_RPC_NAMES = {
  touchActiveVoterPresence: "normalized_touch_voter_presence",
  acquireHostLock: "normalized_acquire_host_lock",
  refreshHostLock: "normalized_heartbeat_host_lock",
  releaseHostLock: "normalized_release_host_lock",
  openVotingWindow: "normalized_open_voting_window",
  pauseVotingWindow: "normalized_pause_voting_window",
  resumeVotingWindow: "normalized_resume_voting_window",
  drawRoundSet: "normalized_draw_round_set",
  rerollOneChart: "normalized_reroll_one_chart",
  rerollRoundSet: "normalized_reroll_round_set",
  rerollFullRound: "normalized_reroll_full_round",
  postVoteRerollInvalidation: "normalized_invalidate_post_vote_reroll_ballots",
  advanceResultReveal: "normalized_advance_result_reveal",
  markResultsRevealed: "normalized_mark_results_revealed",
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

  return record.committed === true && !("rows_changed" in record) && !("changed_rows" in record);
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
