import "server-only";
import { createHash } from "node:crypto";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";
import { getTournamentEventId } from "@/lib/server/env";
import type { Json } from "@/lib/db/database.types";

type RateLimitBucket = {
  count: number;
  resetAtMs: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
  message?: string;
};

type RateLimitRpcClient = {
  rpc(
    functionName: "normalized_check_rate_limit",
    args: {
      p_event_id: string;
      p_payload: Json;
    },
  ): Promise<{
    data: Json | null;
    error: { message: string } | null;
  }>;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  biteOpenRateLimitBuckets?: Map<string, RateLimitBucket>;
};

const buckets =
  globalForRateLimit.biteOpenRateLimitBuckets ??
  (globalForRateLimit.biteOpenRateLimitBuckets = new Map<string, RateLimitBucket>());

export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function shouldUseSupabaseRateLimit() {
  return process.env.TOURNAMENT_STATE_BACKEND === "supabase";
}

function hashRateLimitKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function asRateLimitResponse(data: Json | null) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Supabase rate limit returned an invalid response.");
  }

  const record = data as Record<string, unknown>;

  if (typeof record.allowed !== "boolean" || typeof record.retryAfterMs !== "number") {
    throw new Error("Supabase rate limit returned an invalid response.");
  }

  return {
    allowed: record.allowed,
    retryAfterMs: Math.max(0, record.retryAfterMs),
  };
}

async function assertSupabaseRateLimit(input: RateLimitInput) {
  const supabase = createServiceRoleSupabaseClient() as unknown as RateLimitRpcClient;
  const { data, error } = await supabase.rpc("normalized_check_rate_limit", {
    p_event_id: getTournamentEventId(),
    p_payload: {
      keyHash: hashRateLimitKey(input.key),
      limit: input.limit,
      windowMs: input.windowMs,
    },
  });

  if (error) {
    throw new Error(`Supabase rate limit failed: ${error.message}`);
  }

  const result = asRateLimitResponse(data);

  if (!result.allowed) {
    throw new RateLimitError(
      input.message ??
        `Too many attempts. Try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds.`,
      result.retryAfterMs,
    );
  }
}

function assertMemoryRateLimit(input: RateLimitInput) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = buckets.get(input.key);
  const bucket =
    existing && existing.resetAtMs > nowMs
      ? existing
      : {
          count: 0,
          resetAtMs: nowMs + input.windowMs,
        };

  bucket.count += 1;
  buckets.set(input.key, bucket);

  if (bucket.count > input.limit) {
    const retryAfterMs = Math.max(0, bucket.resetAtMs - nowMs);

    throw new RateLimitError(
      input.message ?? `Too many attempts. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
      retryAfterMs,
    );
  }
}

export async function assertRateLimit(input: RateLimitInput) {
  if (shouldUseSupabaseRateLimit()) {
    await assertSupabaseRateLimit(input);
    return;
  }

  assertMemoryRateLimit(input);
}

export function resetRateLimitState() {
  buckets.clear();
}
