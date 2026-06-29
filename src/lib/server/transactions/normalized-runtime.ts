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
  submitBallot: submitBallotInputSchema,
  manualBallotOverride: manualBallotOverrideInputSchema,
  claimActiveVoterPresence: activeVoterPresenceInputSchema,
  touchActiveVoterPresence: activeVoterPresenceInputSchema,
  acquireHostLock: acquireHostLockInputSchema,
  refreshHostLock: acquireHostLockInputSchema,
  releaseHostLock: releaseHostLockInputSchema,
  openVotingWindow: openVotingWindowInputSchema,
  pauseVotingWindow: pauseVotingWindowInputSchema,
  resumeVotingWindow: resumeVotingWindowInputSchema,
  closeVotingWindow: closeVotingWindowInputSchema,
  reopenVotingWindow: reopenVotingWindowInputSchema,
  advanceVotingTimer: advanceVotingTimerInputSchema,
  drawRoundSet: drawRoundSetInputSchema,
  rerollOneChart: rerollOneChartInputSchema,
  rerollRoundSet: rerollRoundSetInputSchema,
  rerollFullRound: rerollFullRoundInputSchema,
  postVoteRerollInvalidation: postVoteRerollInvalidationInputSchema,
  computeResults: computeResultsInputSchema,
  advanceResultReveal: advanceResultRevealInputSchema,
  markResultsRevealed: markResultsRevealedInputSchema,
  overrideResult: overrideResultInputSchema,
  resetRound: resetRoundInputSchema,
  adminSessionCreate: adminSessionCreateInputSchema,
  adminSessionTouch: adminSessionTouchInputSchema,
  adminSessionLogout: adminSessionEndInputSchema,
  adminSessionRevoke: adminSessionEndInputSchema,
} as const;

export type NormalizedTransactionalMutationName =
  keyof typeof NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS;

export type NormalizedTransactionalMutationInput<
  TName extends NormalizedTransactionalMutationName,
> = z.input<(typeof NORMALIZED_TRANSACTIONAL_MUTATION_SCHEMAS)[TName]>;

export const NORMALIZED_RUNTIME_RPC_NAMES = {
  submitBallot: "normalized_submit_ballot",
  manualBallotOverride: "normalized_manual_ballot_override",
  claimActiveVoterPresence: "normalized_claim_voter_presence",
  touchActiveVoterPresence: "normalized_touch_voter_presence",
  acquireHostLock: "normalized_acquire_host_lock",
  refreshHostLock: "normalized_heartbeat_host_lock",
  releaseHostLock: "normalized_release_host_lock",
  openVotingWindow: "normalized_open_voting_window",
  pauseVotingWindow: "normalized_pause_voting_window",
  resumeVotingWindow: "normalized_resume_voting_window",
  closeVotingWindow: "normalized_close_voting_window",
  reopenVotingWindow: "normalized_reopen_voting_window",
  advanceVotingTimer: "normalized_advance_voting_timer",
  drawRoundSet: "normalized_draw_round_set",
  rerollOneChart: "normalized_reroll_one_chart",
  rerollRoundSet: "normalized_reroll_round_set",
  rerollFullRound: "normalized_reroll_full_round",
  postVoteRerollInvalidation: "normalized_invalidate_post_vote_reroll_ballots",
  computeResults: "normalized_compute_results",
  advanceResultReveal: "normalized_advance_result_reveal",
  markResultsRevealed: "normalized_mark_results_revealed",
  overrideResult: "normalized_override_result",
  resetRound: "normalized_reset_round",
  adminSessionCreate: "normalized_create_admin_session",
  adminSessionTouch: "normalized_touch_admin_session",
  adminSessionLogout: "normalized_logout_admin_session",
  adminSessionRevoke: "normalized_revoke_admin_session",
} as const satisfies Record<NormalizedTransactionalMutationName, NormalizedRuntimeRpcName>;

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

  return data;
}
