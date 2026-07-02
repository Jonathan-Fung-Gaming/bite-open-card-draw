import { describe, expect, it } from "vitest";
import {
  createHostToken,
  HOST_LOCK_TTL_MS,
  HostLockStore,
  resolveHostLockPersistence,
} from "./host-lock";

describe("host lock store", () => {
  it("keeps enough acquisition margin for remote persistence and page refresh", () => {
    expect(HOST_LOCK_TTL_MS).toBeGreaterThanOrEqual(60_000);
  });

  it("allows one active host and marks others read-only", () => {
    const store = new HostLockStore();
    const token = createHostToken();

    store.acquire("session-a", token, 1000);

    expect(store.getSnapshot("session-a", 1000).status).toBe("active");
    expect(store.getSnapshot("session-b", 1000).status).toBe("readonly");
  });

  it("allows takeover after heartbeat expiry", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1000);
    store.acquire("session-b", "token-b", 1000 + HOST_LOCK_TTL_MS + 1);

    expect(store.getSnapshot("session-b", 1000 + HOST_LOCK_TTL_MS + 1).status).toBe("active");
  });

  it("blocks unexpired takeover unless force is explicit", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1000);

    expect(() => store.acquire("session-b", "token-b", 1001)).toThrow(
      "Active host lock is still unexpired",
    );
    expect(store.getSnapshot("session-a", 1001).status).toBe("active");

    const takeover = store.acquire("session-b", "token-b", 1002, { force: true });

    expect(takeover.takeover).toBe(true);
    expect(store.getSnapshot("session-b", 1002).status).toBe("active");
  });

  it("reports non-host release attempts as failed no-ops without clearing the lock", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1000);

    const result = store.release("session-b", "token-b", 1001);

    expect(result).toMatchObject({
      released: false,
      outcome: "not_active_host",
      snapshot: {
        status: "readonly",
        ownerSessionId: "session-a",
      },
    });
    expect(store.getSnapshot("session-a", 1001).status).toBe("active");
  });

  it("keeps a newer takeover when a stale session heartbeat is persisted later", () => {
    const originalStore = new HostLockStore();

    originalStore.acquire("session-a", "token-a", 1000);

    const baseline = originalStore.exportSnapshot();
    const staleHeartbeatStore = new HostLockStore();
    const takeoverStore = new HostLockStore();

    staleHeartbeatStore.importSnapshot(baseline);
    takeoverStore.importSnapshot(baseline);

    expect(staleHeartbeatStore.refresh("session-a", "token-a", 1500)).toBe(true);
    takeoverStore.acquire("session-b", "token-b", 2000, { force: true });

    const decision = resolveHostLockPersistence({
      baseline,
      current: staleHeartbeatStore.exportSnapshot(),
      latest: takeoverStore.exportSnapshot(),
      now: 2001,
    });

    expect(decision).toMatchObject({
      action: "noop",
      outcome: "stale_heartbeat",
      snapshot: {
        lock: {
          ownerSessionId: "session-b",
          heartbeatAt: 2000,
        },
      },
    });
  });

  it("keeps a newer takeover when a stale session release is persisted later", () => {
    const originalStore = new HostLockStore();

    originalStore.acquire("session-a", "token-a", 1000);

    const baseline = originalStore.exportSnapshot();
    const staleReleaseStore = new HostLockStore();
    const takeoverStore = new HostLockStore();

    staleReleaseStore.importSnapshot(baseline);
    takeoverStore.importSnapshot(baseline);

    expect(staleReleaseStore.release("session-a", "token-a", 1500)).toMatchObject({
      released: true,
      outcome: "released",
    });
    takeoverStore.acquire("session-b", "token-b", 2000, { force: true });

    const decision = resolveHostLockPersistence({
      baseline,
      current: staleReleaseStore.exportSnapshot(),
      latest: takeoverStore.exportSnapshot(),
      now: 2001,
    });

    expect(decision).toMatchObject({
      action: "noop",
      outcome: "stale_release",
      snapshot: {
        lock: {
          ownerSessionId: "session-b",
          heartbeatAt: 2000,
        },
      },
    });
  });
});
