import { describe, expect, it } from "vitest";
import { createAdminStateStores, createOperationalStateSnapshot } from "./operational-state";
import { mergeOperationalStateSnapshots } from "./merge";

function snapshotWithHostLock(
  ownerSessionId: string | null,
  acquiredAt: number,
  options: { force?: boolean } = {},
) {
  const stores = createAdminStateStores();

  if (ownerSessionId) {
    stores.hostLockStore.acquire(ownerSessionId, `${ownerSessionId}-token`, acquiredAt, options);
  }

  return createOperationalStateSnapshot(stores, new Date(acquiredAt).toISOString());
}

describe("operational state merge", () => {
  it("keeps a newly acquired host lock when the latest persisted state has no lock", () => {
    const baseline = snapshotWithHostLock(null, 0);
    const current = snapshotWithHostLock("session-a", 1_000);
    const latest = snapshotWithHostLock(null, 2_000);

    const merged = mergeOperationalStateSnapshots({ baseline, current, latest });

    expect(merged.hostLock.lock?.ownerSessionId).toBe("session-a");
  });

  it("prefers the newer host takeover over a stale heartbeat", () => {
    const baseline = snapshotWithHostLock("session-a", 0);
    const staleHeartbeat = snapshotWithHostLock("session-a", 1_000);
    const newerTakeover = snapshotWithHostLock("session-b", 1_200, { force: true });

    const staleAfterTakeover = mergeOperationalStateSnapshots({
      baseline,
      current: staleHeartbeat,
      latest: newerTakeover,
    });
    const takeoverAfterStale = mergeOperationalStateSnapshots({
      baseline,
      current: newerTakeover,
      latest: staleHeartbeat,
    });

    expect(staleAfterTakeover.hostLock.lock?.ownerSessionId).toBe("session-b");
    expect(takeoverAfterStale.hostLock.lock?.ownerSessionId).toBe("session-b");
  });
});
