import "server-only";
import {
  cloneOperationalStateSnapshot,
  type OperationalStateSnapshot,
} from "@/lib/persistence/operational-state";

type PublicHydrationCacheEntry = {
  expiresAtMs: number;
  key: string;
  snapshotPromise: Promise<OperationalStateSnapshot | null>;
};

const DEFAULT_PUBLIC_HYDRATION_CACHE_TTL_MS = 1_000;
const MAX_PUBLIC_HYDRATION_CACHE_TTL_MS = 5_000;

const globalForPublicHydrationCache = globalThis as typeof globalThis & {
  biteOpenPublicHydrationCache?: PublicHydrationCacheEntry;
};

function cloneSnapshot(snapshot: OperationalStateSnapshot | null) {
  return snapshot ? cloneOperationalStateSnapshot(snapshot) : null;
}

function publicHydrationCacheTtlMs() {
  const configured = process.env.TOURNAMENT_PUBLIC_READ_CACHE_MS;

  if (!configured) {
    return DEFAULT_PUBLIC_HYDRATION_CACHE_TTL_MS;
  }

  const parsed = Number(configured);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PUBLIC_HYDRATION_CACHE_TTL_MS;
  }

  return Math.min(
    Math.max(Math.trunc(parsed), 0),
    MAX_PUBLIC_HYDRATION_CACHE_TTL_MS,
  );
}

export function invalidateTournamentReadCaches() {
  globalForPublicHydrationCache.biteOpenPublicHydrationCache = undefined;
}

export async function readCachedPublicOperationalStateSnapshot(
  key: string,
  loadSnapshot: () => Promise<OperationalStateSnapshot | null>,
) {
  const ttlMs = publicHydrationCacheTtlMs();

  if (ttlMs <= 0) {
    return cloneSnapshot(await loadSnapshot());
  }

  const nowMs = Date.now();
  const existing = globalForPublicHydrationCache.biteOpenPublicHydrationCache;

  if (existing && existing.key === key && existing.expiresAtMs > nowMs) {
    return cloneSnapshot(await existing.snapshotPromise);
  }

  const snapshotPromise = loadSnapshot().then((snapshot) => cloneSnapshot(snapshot));

  globalForPublicHydrationCache.biteOpenPublicHydrationCache = {
    expiresAtMs: nowMs + ttlMs,
    key,
    snapshotPromise,
  };

  try {
    return cloneSnapshot(await snapshotPromise);
  } catch (error) {
    if (globalForPublicHydrationCache.biteOpenPublicHydrationCache?.snapshotPromise === snapshotPromise) {
      invalidateTournamentReadCaches();
    }

    throw error;
  }
}
