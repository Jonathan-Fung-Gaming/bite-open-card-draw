import "server-only";
import { z } from "zod";
import type { BallotSetChoice } from "@/lib/vote/ballot";
import { withNormalizedEventPersistenceLock } from "@/lib/server/normalized-operational-state";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const normalizedManualBallotOverrideResultSchema = z.object({
  ballotId: z.string().uuid(),
  revision: z.number().int().positive(),
  roundNumber: z.number().int().min(1).max(4),
  manualOverride: z.boolean(),
  replacedExistingBallot: z.boolean(),
  invalidatedComputedResult: z.boolean(),
  adminActionId: z.string().uuid(),
});

const normalizedReopenVotingWindowResultSchema = z.object({
  roundNumber: z.number().int().min(1).max(4),
  status: z.literal("voting_open"),
  closesAt: z.string(),
  durationMinutes: z.number().int().min(1).max(10),
  invalidatedComputedResult: z.boolean(),
  adminActionId: z.string().uuid(),
});

const normalizedResetRoundResultSchema = z.object({
  roundNumber: z.number().int().min(1).max(4),
  rowsChanged: z.number().int().nonnegative(),
  adminActionId: z.string().uuid(),
});

const normalizedCloseVotingWindowResultSchema = z.object({
  roundNumber: z.number().int().min(1).max(4),
  status: z.literal("voting_closed"),
  closedAt: z.string(),
  adminActionId: z.string().uuid(),
  rowsChanged: z.number().int().nonnegative(),
});

export type NormalizedManualBallotOverrideResult = z.infer<
  typeof normalizedManualBallotOverrideResultSchema
>;
export type NormalizedReopenVotingWindowResult = z.infer<
  typeof normalizedReopenVotingWindowResultSchema
>;
export type NormalizedResetRoundResult = z.infer<typeof normalizedResetRoundResultSchema>;
export type NormalizedCloseVotingWindowResult = z.infer<
  typeof normalizedCloseVotingWindowResultSchema
>;

export async function submitNormalizedManualBallotOverride(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  choices: BallotSetChoice[];
  replaceExistingBallot: boolean;
  reason: string;
  adminSessionId: string;
}): Promise<NormalizedManualBallotOverrideResult> {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("manualBallotOverride", {
      roundNumber: input.roundNumber,
      playerId: input.playerId,
      choices: input.choices.map((choice) => ({
        drawId: choice.drawId,
        roundSetId: choice.roundSetId,
        noBans: choice.noBans,
        bannedChartIds: choice.bannedChartIds,
      })),
      replaceExistingBallot: input.replaceExistingBallot,
      reason: input.reason,
      adminSessionId: input.adminSessionId,
    }),
  );

  return normalizedManualBallotOverrideResultSchema.parse(result);
}

export async function reopenNormalizedVotingWindow(input: {
  roundNumber: 1 | 2 | 3 | 4;
  durationMinutes: number;
  reason: string;
  adminSessionId: string;
}): Promise<NormalizedReopenVotingWindowResult> {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("reopenVotingWindow", {
      roundNumber: input.roundNumber,
      durationMinutes: input.durationMinutes,
      reason: input.reason,
      adminSessionId: input.adminSessionId,
    }),
  );

  return normalizedReopenVotingWindowResultSchema.parse(result);
}

export async function resetNormalizedRound(input: {
  roundNumber: 1 | 2 | 3 | 4;
  reason: string;
  adminSessionId: string;
}): Promise<NormalizedResetRoundResult> {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("resetRound", {
      roundNumber: input.roundNumber,
      reason: input.reason,
      adminSessionId: input.adminSessionId,
    }),
  );

  return normalizedResetRoundResultSchema.parse(result);
}

export async function closeNormalizedVotingWindow(input: {
  roundNumber: 1 | 2 | 3 | 4;
  adminSessionId: string;
}): Promise<NormalizedCloseVotingWindowResult> {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("closeVotingWindow", {
      roundNumber: input.roundNumber,
      adminSessionId: input.adminSessionId,
    }),
  );

  return normalizedCloseVotingWindowResultSchema.parse(result);
}
