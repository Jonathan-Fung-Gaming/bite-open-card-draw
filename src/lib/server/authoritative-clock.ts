import "server-only";
import type { Database } from "@/lib/db/database.types";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";

type DatabaseTimeRpcClient = {
  rpc(
    functionName: "normalized_database_time",
    args: Record<string, never>,
  ): Promise<{
    data: Database["public"]["Functions"]["normalized_database_time"]["Returns"] | null;
    error: { message: string } | null;
  }>;
};

type AuthoritativeClockCacheEntry = {
  databaseNowMs: number;
  expiresAtMs: number;
  localReadAtMs: number;
};

type AuthoritativeClockPendingRead = {
  promise: Promise<AuthoritativeClockCacheEntry>;
};

const DEFAULT_DATABASE_TIME_CACHE_TTL_MS = 1_000;
const MAX_DATABASE_TIME_CACHE_TTL_MS = 5_000;

const globalForAuthoritativeClock = globalThis as typeof globalThis & {
  biteOpenAuthoritativeClockCache?: AuthoritativeClockCacheEntry;
  biteOpenAuthoritativeClockPendingRead?: AuthoritativeClockPendingRead;
};

function shouldUseDatabaseTime() {
  return process.env.TOURNAMENT_STATE_BACKEND === "supabase";
}

function databaseTimeCacheTtlMs() {
  const configured = process.env.TOURNAMENT_DATABASE_TIME_CACHE_MS;

  if (!configured) {
    return DEFAULT_DATABASE_TIME_CACHE_TTL_MS;
  }

  const parsed = Number(configured);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_DATABASE_TIME_CACHE_TTL_MS;
  }

  return Math.min(Math.max(Math.trunc(parsed), 0), MAX_DATABASE_TIME_CACHE_TTL_MS);
}

function cachedDatabaseNowMs(entry: AuthoritativeClockCacheEntry) {
  return entry.databaseNowMs + Math.max(Date.now() - entry.localReadAtMs, 0);
}

async function readHostedDatabaseTime(ttlMs: number): Promise<AuthoritativeClockCacheEntry> {
  const supabase = createServiceRoleSupabaseClient() as unknown as DatabaseTimeRpcClient;
  const { data, error } = await supabase.rpc("normalized_database_time", {});
  const localReadAtMs = Date.now();

  if (error) {
    throw new Error(`Could not read hosted Supabase database time: ${error.message}`);
  }

  const databaseNowMs = Date.parse(data ?? "");

  if (!Number.isFinite(databaseNowMs)) {
    throw new Error("Hosted Supabase database time returned an invalid timestamp.");
  }

  return {
    databaseNowMs,
    expiresAtMs: localReadAtMs + ttlMs,
    localReadAtMs,
  };
}

export function invalidateAuthoritativeClockCache() {
  globalForAuthoritativeClock.biteOpenAuthoritativeClockCache = undefined;
  globalForAuthoritativeClock.biteOpenAuthoritativeClockPendingRead = undefined;
}

export async function getAuthoritativeNowMs() {
  if (!shouldUseDatabaseTime()) {
    return Date.now();
  }

  const ttlMs = databaseTimeCacheTtlMs();
  const nowMs = Date.now();
  const cached = globalForAuthoritativeClock.biteOpenAuthoritativeClockCache;

  if (ttlMs > 0 && cached && cached.expiresAtMs > nowMs) {
    return cachedDatabaseNowMs(cached);
  }

  const pending = globalForAuthoritativeClock.biteOpenAuthoritativeClockPendingRead;

  if (ttlMs > 0 && pending) {
    return cachedDatabaseNowMs(await pending.promise);
  }

  const promise = readHostedDatabaseTime(ttlMs);

  if (ttlMs > 0) {
    globalForAuthoritativeClock.biteOpenAuthoritativeClockPendingRead = {
      promise,
    };
  }

  try {
    const nextCached = await promise;

    if (ttlMs > 0) {
      globalForAuthoritativeClock.biteOpenAuthoritativeClockCache = nextCached;
    }

    return ttlMs > 0 ? cachedDatabaseNowMs(nextCached) : nextCached.databaseNowMs;
  } finally {
    if (globalForAuthoritativeClock.biteOpenAuthoritativeClockPendingRead?.promise === promise) {
      globalForAuthoritativeClock.biteOpenAuthoritativeClockPendingRead = undefined;
    }
  }
}
