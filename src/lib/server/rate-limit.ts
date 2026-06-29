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

export function assertRateLimit(input: RateLimitInput) {
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

export function resetRateLimitState() {
  buckets.clear();
}
