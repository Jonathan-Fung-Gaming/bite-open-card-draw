import "server-only";
import { z } from "zod";
import { withNormalizedEventPersistenceLock } from "@/lib/server/normalized-operational-state";
import type { NormalizedAdminTransitionContext } from "@/lib/server/normalized-round-transitions";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const normalizedComputeResultsSchema = z.object({
  resultId: z.string().uuid(),
  roundNumber: z.number().int().min(1).max(4),
  computedAt: z.string(),
  status: z.literal("results_computed"),
  adminActionId: z.string().uuid(),
  requestId: z.string().uuid(),
  generation: z.number().int().nonnegative(),
  transitionKind: z.literal("results_computed"),
});

export type NormalizedComputeResults = z.infer<typeof normalizedComputeResultsSchema>;

export async function computeNormalizedResults(
  input: NormalizedAdminTransitionContext,
): Promise<NormalizedComputeResults> {
  const result = await withNormalizedEventPersistenceLock(() =>
    executeNormalizedTransactionalMutation("computeResults", input),
  );

  return normalizedComputeResultsSchema.parse(result);
}
