import "server-only";
import { z } from "zod";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const VOTER_PRESENCE_TTL_MS = 2 * 60 * 1000;

const normalizedVoterPresenceResultSchema = z.object({
  otherActiveDeviceCount: z.number().int().nonnegative(),
  hasOtherActiveDevice: z.boolean(),
});

export type NormalizedVoterPresenceResult = z.infer<
  typeof normalizedVoterPresenceResultSchema
>;

export async function claimNormalizedVoterPresence(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  deviceId: string;
}): Promise<NormalizedVoterPresenceResult> {
  const result = await executeNormalizedTransactionalMutation("claimActiveVoterPresence", {
    roundNumber: input.roundNumber,
    playerId: input.playerId,
    deviceId: input.deviceId,
    expiresAt: new Date(Date.now() + VOTER_PRESENCE_TTL_MS).toISOString(),
  });

  return normalizedVoterPresenceResultSchema.parse(result);
}
