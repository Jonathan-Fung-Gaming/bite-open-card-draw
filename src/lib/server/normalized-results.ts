import "server-only";
import { z } from "zod";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const normalizedComputeResultsSchema = z.object({
  resultId: z.string().uuid(),
  roundNumber: z.number().int().min(1).max(4),
  computedAt: z.string(),
  status: z.literal("results_computed"),
  adminActionId: z.string().uuid(),
});

export type NormalizedComputeResults = z.infer<typeof normalizedComputeResultsSchema>;

export async function computeNormalizedResults(input: {
  roundNumber: 1 | 2 | 3 | 4;
  adminSessionId: string;
}): Promise<NormalizedComputeResults> {
  const result = await executeNormalizedTransactionalMutation("computeResults", {
    roundNumber: input.roundNumber,
    adminSessionId: input.adminSessionId,
  });

  return normalizedComputeResultsSchema.parse(result);
}
