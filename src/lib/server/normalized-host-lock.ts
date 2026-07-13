import "server-only";
import { z } from "zod";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";

const hostLockTimestampSchema = z.string().datetime({ offset: true });

const acquireHostLockResultSchema = z.object({
  outcome: z.enum(["acquired", "restored", "forced_takeover"]),
  ownerSessionId: z.string().trim().min(1),
  acquiredAt: hostLockTimestampSchema,
  heartbeatAt: hostLockTimestampSchema,
  expiresAt: hostLockTimestampSchema,
  adminActionId: z.string().uuid(),
});

const heartbeatHostLockResultSchema = z.object({
  outcome: z.literal("refreshed"),
  ownerSessionId: z.string().trim().min(1),
  heartbeatAt: hostLockTimestampSchema,
  expiresAt: hostLockTimestampSchema,
});

const releaseHostLockResultSchema = z.object({
  outcome: z.literal("released"),
  previousOwnerSessionId: z.string().trim().min(1),
  releasedAt: hostLockTimestampSchema,
  adminActionId: z.string().uuid(),
});

export type NormalizedHostLockMode = "take" | "restore" | "force";

function phase3UnavailableMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : "Unknown host-lock transaction error.";

  if (/placeholder|disabled|does not exist|schema cache/i.test(detail)) {
    return new Error(
      "Host control changes are unavailable until the Phase 3 database migration is applied.",
    );
  }

  return error instanceof Error ? error : new Error(detail);
}

export async function acquireNormalizedHostLock(input: {
  requestId: string;
  mode: NormalizedHostLockMode;
  adminSessionId: string;
  hostTokenHash: string;
  expectedHostTokenHash?: string | null;
  recoveryOwnerSessionId?: string | null;
  reason?: string | null;
}) {
  try {
    const result = await executeNormalizedTransactionalMutation("acquireHostLock", input);

    return acquireHostLockResultSchema.parse(result);
  } catch (error) {
    throw phase3UnavailableMessage(error);
  }
}

export async function heartbeatNormalizedHostLock(input: {
  requestId: string;
  adminSessionId: string;
  hostTokenHash: string;
}) {
  try {
    const result = await executeNormalizedTransactionalMutation("refreshHostLock", input);

    return heartbeatHostLockResultSchema.parse(result);
  } catch (error) {
    throw phase3UnavailableMessage(error);
  }
}

export async function releaseNormalizedHostLock(input: {
  requestId: string;
  adminSessionId: string;
  hostTokenHash: string;
}) {
  try {
    const result = await executeNormalizedTransactionalMutation("releaseHostLock", input);

    return releaseHostLockResultSchema.parse(result);
  } catch (error) {
    throw phase3UnavailableMessage(error);
  }
}
