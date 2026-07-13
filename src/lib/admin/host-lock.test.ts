import { describe, expect, it } from "vitest";
import {
  createHostToken,
  HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
  hashHostToken,
  HostLockStore,
  resolveHostLockPersistence,
} from "./host-lock";

describe("host lock store", () => {
  it("keeps the heartbeat health threshold separate from far-future compatibility expiry", () => {
    const store = new HostLockStore();

    expect(HOST_LOCK_COMPATIBILITY_EXPIRES_AT).toBe(Date.parse("9999-12-31T23:59:59.999Z"));

    store.acquire("session-a", "token-a", 1_000);

    expect(store.exportSnapshot().lock?.expiresAt).toBe(HOST_LOCK_COMPATIBILITY_EXPIRES_AT);
  });

  it("requires both the owner session and primary credential for active status", () => {
    const store = new HostLockStore();
    const token = createHostToken();

    store.acquire("session-a", token, 1_000);

    expect(store.getSnapshot("session-a", 1_000, { hostToken: token }).status).toBe("active");
    expect(store.getSnapshot("session-a", 1_000).status).toBe("recoverable");
    expect(store.getSnapshot("session-a", 1_000, { hostToken: "wrong-token" }).status).toBe(
      "recoverable",
    );
    expect(store.getSnapshot("session-b", 1_000, { hostToken: token }).status).toBe("readonly");
    expect(store.getSnapshot("session-b", 1_000).status).toBe("readonly");
  });

  it("reports recovery only to a verified current session with an owner binding", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);

    expect(
      store.getSnapshot("session-b", 1_001, {
        recoveryHostTokenHash: hashHostToken("token-a"),
        recoveryOwnerSessionId: "session-a",
      }).status,
    ).toBe("recoverable");
    expect(
      store.getSnapshot("session-b", 1_001, {
        recoveryHostTokenHash: hashHostToken("token-a"),
        recoveryOwnerSessionId: "another-owner",
      }).status,
    ).toBe("readonly");
    expect(
      store.getSnapshot(null, 1_001, {
        recoveryHostTokenHash: hashHostToken("token-a"),
        recoveryOwnerSessionId: "session-a",
      }).status,
    ).toBe("readonly");
    expect(
      store.getSnapshot("session-b", 1_001, {
        recoveryHostTokenHash: hashHostToken("stale-token"),
        recoveryOwnerSessionId: "session-a",
      }).status,
    ).toBe("readonly");
  });

  it("keeps legacy-expired ownership authoritative and requires explicit force", () => {
    const store = new HostLockStore();

    store.importSnapshot({
      lock: {
        ownerSessionId: "session-a",
        hostTokenHash: hashHostToken("token-a"),
        acquiredAt: 1_000,
        heartbeatAt: 1_000,
        expiresAt: 1_001,
      },
    });

    expect(store.getSnapshot("session-b", 10_000).status).toBe("readonly");
    expect(() => store.acquire("session-b", "token-b", 10_000)).toThrow(
      "A host owner already exists",
    );

    const takeover = store.acquire("session-b", "token-b", 10_001, { force: true });

    expect(takeover.takeover).toBe(true);
    expect(takeover.snapshot.status).toBe("active");
  });

  it("allows the credential-matched owner to refresh and release after legacy expiry", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);
    const legacy = store.exportSnapshot();
    const lock = legacy.lock;

    expect(lock).not.toBeNull();
    store.importSnapshot({
      lock: lock
        ? {
            ...lock,
            expiresAt: 1_001,
          }
        : null,
    });

    expect(store.refresh("session-a", "token-a", 10_000)).toBe(true);
    expect(store.exportSnapshot().lock).toMatchObject({
      heartbeatAt: 10_000,
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    });
    expect(store.release("session-a", "token-a", 20_000)).toMatchObject({
      released: true,
      outcome: "released",
      snapshot: { status: "inactive" },
    });
  });

  it("restores through owner-session continuity while preserving the acquisition epoch", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);
    const result = store.restore("session-a", "token-b", 2_000, {
      expectedHostTokenHash: hashHostToken("token-a"),
    });

    expect(result).toMatchObject({
      restored: true,
      outcome: "restored",
      snapshot: {
        status: "active",
        ownerSessionId: "session-a",
        heartbeatAt: 2_000,
      },
    });
    expect(store.exportSnapshot().lock).toMatchObject({
      acquiredAt: 1_000,
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    });
    expect(store.refresh("session-a", "token-a", 2_001)).toBe(false);
    expect(store.refresh("session-a", "token-b", 2_001)).toBe(true);
  });

  it("restores a reauthenticated session only with the verified prior-owner binding", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);

    expect(
      store.restore("session-b", "token-b", 2_000, {
        expectedHostTokenHash: hashHostToken("token-a"),
        recoveryOwnerSessionId: "another-owner",
      }),
    ).toMatchObject({
      restored: false,
      outcome: "not_recoverable",
      snapshot: { status: "readonly" },
    });

    expect(
      store.restore("session-b", "token-b", 2_001, {
        expectedHostTokenHash: hashHostToken("token-a"),
        recoveryOwnerSessionId: "session-a",
      }),
    ).toMatchObject({
      restored: true,
      outcome: "restored",
      snapshot: {
        status: "active",
        ownerSessionId: "session-b",
      },
    });
    expect(store.exportSnapshot().lock?.acquiredAt).toBe(1_000);
  });

  it("rejects a second restore that presents the prior credential generation", () => {
    const store = new HostLockStore();
    const priorHash = hashHostToken("token-a");

    store.acquire("session-a", "token-a", 1_000);
    expect(
      store.restore("session-b", "token-b", 2_000, {
        expectedHostTokenHash: priorHash,
        recoveryOwnerSessionId: "session-a",
      }).restored,
    ).toBe(true);
    expect(
      store.restore("session-b", "token-c", 2_001, {
        expectedHostTokenHash: priorHash,
        recoveryOwnerSessionId: "session-b",
      }),
    ).toMatchObject({ restored: false, outcome: "not_recoverable" });
    expect(store.getSnapshot("session-b", 2_001, { hostToken: "token-b" }).status).toBe("active");
  });

  it("reports non-host release attempts as failed no-ops without clearing ownership", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);

    expect(store.release("session-b", "token-b", 1_001)).toMatchObject({
      released: false,
      outcome: "not_active_host",
      snapshot: {
        status: "readonly",
        ownerSessionId: "session-a",
      },
    });
    expect(store.getSnapshot("session-a", 1_001, { hostToken: "token-a" }).status).toBe("active");
  });

  it("allows normal acquisition only after explicit release", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);
    expect(store.release("session-a", "token-a", 1_001)).toMatchObject({
      released: true,
      outcome: "released",
    });

    const acquired = store.acquire("session-b", "token-b", 1_002);

    expect(acquired.takeover).toBe(false);
    expect(acquired.snapshot).toMatchObject({
      status: "active",
      ownerSessionId: "session-b",
    });
  });

  it("never downgrades force to a normal acquire or lets the current owner force itself", () => {
    const store = new HostLockStore();

    expect(() => store.acquire("session-b", "token-b", 1_000, { force: true })).toThrow(
      "Use normal Take Host Control",
    );

    store.acquire("session-a", "token-a", 1_001);

    expect(() => store.acquire("session-a", "rotated-token", 1_002, { force: true })).toThrow(
      "must use Restore",
    );
    expect(store.getSnapshot("session-a", 1_002, { hostToken: "token-a" }).status).toBe("active");
  });

  it("strictly advances the acquisition epoch when a force uses the same clock tick", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);
    store.acquire("session-b", "token-b", 1_000, { force: true });

    expect(store.exportSnapshot().lock).toMatchObject({
      ownerSessionId: "session-b",
      acquiredAt: 1_001,
      heartbeatAt: 1_001,
    });
  });
});

describe("host lock persistence resolution", () => {
  it("keeps the first normal acquisition even when its compatibility expiry is in the past", () => {
    const first = new HostLockStore();
    const racing = new HostLockStore();

    first.acquire("session-a", "token-a", 1_000);
    racing.acquire("session-b", "token-b", 2_000);

    const firstSnapshot = first.exportSnapshot();
    const firstLock = firstSnapshot.lock;

    expect(firstLock).not.toBeNull();
    const decision = resolveHostLockPersistence({
      baseline: { lock: null },
      current: racing.exportSnapshot(),
      latest: {
        lock: firstLock
          ? {
              ...firstLock,
              expiresAt: 1_001,
            }
          : null,
      },
      now: 100_000,
    });

    expect(decision).toMatchObject({
      action: "noop",
      outcome: "stale_acquire",
      snapshot: { lock: { ownerSessionId: "session-a" } },
    });
  });

  it("persists explicit release without any expiry-clearing outcome", () => {
    const store = new HostLockStore();

    store.acquire("session-a", "token-a", 1_000);
    const baseline = store.exportSnapshot();
    expect(store.release("session-a", "token-a", 100_000).released).toBe(true);

    const decision = resolveHostLockPersistence({
      baseline,
      current: store.exportSnapshot(),
      latest: baseline,
      now: 100_000,
    });

    expect(decision).toMatchObject({
      action: "delete",
      outcome: "release",
      lock: null,
    });
  });

  it("keeps a newer force when a stale heartbeat is persisted later", () => {
    const original = new HostLockStore();

    original.acquire("session-a", "token-a", 1_000);
    const baseline = original.exportSnapshot();
    const staleHeartbeat = new HostLockStore();
    const forced = new HostLockStore();

    staleHeartbeat.importSnapshot(baseline);
    forced.importSnapshot(baseline);
    expect(staleHeartbeat.refresh("session-a", "token-a", 1_500)).toBe(true);
    forced.acquire("session-b", "token-b", 2_000, { force: true });

    expect(
      resolveHostLockPersistence({
        baseline,
        current: staleHeartbeat.exportSnapshot(),
        latest: forced.exportSnapshot(),
      }),
    ).toMatchObject({
      action: "noop",
      outcome: "stale_heartbeat",
      snapshot: { lock: { ownerSessionId: "session-b", heartbeatAt: 2_000 } },
    });
  });

  it("keeps a newer force when a stale release is persisted later", () => {
    const original = new HostLockStore();

    original.acquire("session-a", "token-a", 1_000);
    const baseline = original.exportSnapshot();
    const staleRelease = new HostLockStore();
    const forced = new HostLockStore();

    staleRelease.importSnapshot(baseline);
    forced.importSnapshot(baseline);
    expect(staleRelease.release("session-a", "token-a", 1_500).released).toBe(true);
    forced.acquire("session-b", "token-b", 2_000, { force: true });

    expect(
      resolveHostLockPersistence({
        baseline,
        current: staleRelease.exportSnapshot(),
        latest: forced.exportSnapshot(),
      }),
    ).toMatchObject({
      action: "noop",
      outcome: "stale_release",
      snapshot: { lock: { ownerSessionId: "session-b" } },
    });
  });

  it("keeps a newer force when a stale restore is persisted later", () => {
    const original = new HostLockStore();

    original.acquire("session-a", "token-a", 1_000);
    const baseline = original.exportSnapshot();
    const staleRestore = new HostLockStore();
    const forced = new HostLockStore();

    staleRestore.importSnapshot(baseline);
    forced.importSnapshot(baseline);
    expect(
      staleRestore.restore("session-a", "token-a-rotated", 1_500, {
        expectedHostTokenHash: hashHostToken("token-a"),
      }).restored,
    ).toBe(true);
    forced.acquire("session-b", "token-b", 2_000, { force: true });

    expect(
      resolveHostLockPersistence({
        baseline,
        current: staleRestore.exportSnapshot(),
        latest: forced.exportSnapshot(),
      }),
    ).toMatchObject({
      action: "noop",
      outcome: "stale_restore",
      snapshot: { lock: { ownerSessionId: "session-b" } },
    });
  });

  it("persists restore only against the same acquisition epoch", () => {
    const original = new HostLockStore();

    original.acquire("session-a", "token-a", 1_000);
    const baseline = original.exportSnapshot();
    const restored = new HostLockStore();

    restored.importSnapshot(baseline);
    restored.restore("session-b", "token-b", 2_000, {
      expectedHostTokenHash: hashHostToken("token-a"),
      recoveryOwnerSessionId: "session-a",
    });

    expect(
      resolveHostLockPersistence({
        baseline,
        current: restored.exportSnapshot(),
        latest: baseline,
      }),
    ).toMatchObject({
      action: "write",
      outcome: "restore",
      lock: {
        ownerSessionId: "session-b",
        acquiredAt: 1_000,
        heartbeatAt: 2_000,
      },
    });
  });

  it("resolves concurrent forced takeovers by acquisition time", () => {
    const original = new HostLockStore();

    original.acquire("session-a", "token-a", 1_000);
    const baseline = original.exportSnapshot();
    const earlierForce = new HostLockStore();
    const laterForce = new HostLockStore();

    earlierForce.importSnapshot(baseline);
    laterForce.importSnapshot(baseline);
    earlierForce.acquire("session-b", "token-b", 2_000, { force: true });
    laterForce.acquire("session-c", "token-c", 3_000, { force: true });

    expect(
      resolveHostLockPersistence({
        baseline,
        current: earlierForce.exportSnapshot(),
        latest: laterForce.exportSnapshot(),
      }),
    ).toMatchObject({
      action: "noop",
      outcome: "stale_takeover",
      snapshot: { lock: { ownerSessionId: "session-c" } },
    });
    expect(
      resolveHostLockPersistence({
        baseline,
        current: laterForce.exportSnapshot(),
        latest: earlierForce.exportSnapshot(),
      }),
    ).toMatchObject({
      action: "write",
      outcome: "takeover",
      lock: { ownerSessionId: "session-c" },
    });
  });
});
