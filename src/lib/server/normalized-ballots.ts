import "server-only";
import { z } from "zod";
import type { BallotSetChoice } from "@/lib/vote/ballot";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const normalizedSubmitBallotResultSchema = z.object({
  ballotId: z.string().uuid(),
  revision: z.number().int().positive(),
  submittedAt: z.string(),
  playerStartggUsername: z.string(),
  submittedCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  status: z.string(),
});

export type NormalizedSubmitBallotResult = z.infer<typeof normalizedSubmitBallotResultSchema>;

export async function submitNormalizedPlayerBallot(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  deviceId: string;
  choices: BallotSetChoice[];
  editTokenHash?: string | null;
}): Promise<NormalizedSubmitBallotResult> {
  const result = await executeNormalizedTransactionalMutation("submitBallot", {
    roundNumber: input.roundNumber,
    playerId: input.playerId,
    deviceId: input.deviceId,
    editTokenHash: input.editTokenHash ?? undefined,
    choices: input.choices.map((choice) => ({
      drawId: choice.drawId,
      roundSetId: choice.roundSetId,
      noBans: choice.noBans,
      bannedChartIds: choice.bannedChartIds,
    })),
  });

  return normalizedSubmitBallotResultSchema.parse(result);
}
