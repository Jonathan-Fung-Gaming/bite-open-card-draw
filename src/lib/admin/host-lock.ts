import { createHash, randomUUID } from "node:crypto";

export const HOST_LOCK_TTL_MS = 60_000;

export type HostLockStatus = "inactive" | "active" | "readonly";

export type HostLockSnapshot = {
  status: HostLockStatus;
  ownerSessionId: string | null;
  heartbeatAt: number | null;
  expiresAt: number | null;
};

export type HostLockRecord = {
  ownerSessionId: string;
  hostTokenHash: string;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
};

export type HostLockStoreSnapshot = {
  lock: HostLockRecord | null;
};

export type HostLockReleaseOutcome = "released" | "no_active_lock" | "not_active_host";

export type HostLockReleaseResult = {
  released: boolean;
  outcome: HostLockReleaseOutcome;
  snapshot: HostLockSnapshot;
};

export type HostLockPersistenceOutcome =
  | "unchanged"
  | "acquire"
  | "takeover"
  | "refresh"
  | "release"
  | "clear_expired"
  | "stale_acquire"
  | "stale_heartbeat"
  | "stale_release";

export type HostLockPersistenceDecision =
  | {
      action: "write";
      outcome: "acquire" | "takeover" | "refresh";
      lock: HostLockRecord;
      snapshot: HostLockStoreSnapshot;
    }
  | {
      action: "delete";
      outcome: "release" | "clear_expired";
      lock: null;
      snapshot: HostLockStoreSnapshot;
    }
  | {
      action: "noop";
      outcome:
        | "unchanged"
        | "stale_acquire"
        | "stale_heartbeat"
        | "stale_release";
      lock: HostLockRecord | null;
      snapshot: HostLockStoreSnapshot;
    };

function hashHostToken(hostToken: string) {
  return createHash("sha256").update(hostToken).digest("hex");
}

function cloneLock(lock: HostLockRecord | null) {
  return lock ? { ...lock } : null;
}

function snapshotFromLock(lock: HostLockRecord | null): HostLockStoreSnapshot {
  return { lock: cloneLock(lock) };
}

function stableJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function changed(
  baseline: HostLockStoreSnapshot | null | undefined,
  current: HostLockStoreSnapshot | null | undefined,
) {
  return stableJson(baseline ?? { lock: null }) !== stableJson(current ?? { lock: null });
}

function activeLock(lock: HostLockRecord | null | undefined, now: number) {
  return lock && lock.expiresAt > now ? lock : null;
}

function sameHostIdentity(
  left: HostLockRecord | null | undefined,
  right: HostLockRecord | null | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.ownerSessionId === right.ownerSessionId &&
      left.hostTokenHash === right.hostTokenHash,
  );
}

function sameLockAcquisition(
  left: HostLockRecord | null | undefined,
  right: HostLockRecord | null | undefined,
) {
  return sameHostIdentity(left, right) && left?.acquiredAt === right?.acquiredAt;
}

export function resolveHostLockPersistence(
  input: {
    baseline: HostLockStoreSnapshot | null;
    current: HostLockStoreSnapshot;
    latest: HostLockStoreSnapshot | null;
    now?: number;
  },
): HostLockPersistenceDecision {
  const now = input.now ?? Date.now();
  const baseline = input.baseline ?? { lock: null };
  const latest = input.latest ?? { lock: null };
  const baselineLock = baseline.lock;
  const currentLock = input.current.lock;
  const latestLock = latest.lock;
  const activeLatestLock = activeLock(latestLock, now);

  if (!changed(baseline, input.current)) {
    return {
      action: "noop",
      outcome: "unchanged",
      lock: cloneLock(latestLock),
      snapshot: snapshotFromLock(latestLock),
    };
  }

  if (!currentLock) {
    if (!activeLatestLock) {
      return latestLock
        ? {
            action: "delete",
            outcome: "clear_expired",
            lock: null,
            snapshot: snapshotFromLock(null),
          }
        : {
            action: "noop",
            outcome: "unchanged",
            lock: null,
            snapshot: snapshotFromLock(null),
          };
    }

    if (sameHostIdentity(baselineLock, activeLatestLock)) {
      return {
        action: "delete",
        outcome: "release",
        lock: null,
        snapshot: snapshotFromLock(null),
      };
    }

    return {
      action: "noop",
      outcome: "stale_release",
      lock: cloneLock(latestLock),
      snapshot: snapshotFromLock(latestLock),
    };
  }

  if (!activeLatestLock) {
    return {
      action: "write",
      outcome: baselineLock ? "takeover" : "acquire",
      lock: { ...currentLock },
      snapshot: snapshotFromLock(currentLock),
    };
  }

  if (sameLockAcquisition(currentLock, activeLatestLock)) {
    if (currentLock.heartbeatAt >= activeLatestLock.heartbeatAt) {
      return {
        action: "write",
        outcome: "refresh",
        lock: { ...currentLock },
        snapshot: snapshotFromLock(currentLock),
      };
    }

    return {
      action: "noop",
      outcome: "stale_heartbeat",
      lock: cloneLock(latestLock),
      snapshot: snapshotFromLock(latestLock),
    };
  }

  if (currentLock.acquiredAt >= activeLatestLock.acquiredAt) {
    return {
      action: "write",
      outcome: "takeover",
      lock: { ...currentLock },
      snapshot: snapshotFromLock(currentLock),
    };
  }

  return {
    action: "noop",
    outcome:
      sameLockAcquisition(currentLock, baselineLock) || sameHostIdentity(currentLock, activeLatestLock)
        ? "stale_heartbeat"
        : "stale_acquire",
    lock: cloneLock(latestLock),
    snapshot: snapshotFromLock(latestLock),
  };
}

export function createHostToken() {
  return randomUUID();
}

export class HostLockStore {
  private lock: HostLockRecord | null = null;

  getSnapshot(sessionId: string | null, now = Date.now()): HostLockSnapshot {
    if (!this.lock || this.lock.expiresAt <= now) {
      return {
        status: "inactive",
        ownerSessionId: null,
        heartbeatAt: null,
        expiresAt: null,
      };
    }

    return {
      status: this.lock.ownerSessionId === sessionId ? "active" : "readonly",
      ownerSessionId: this.lock.ownerSessionId,
      heartbeatAt: this.lock.heartbeatAt,
      expiresAt: this.lock.expiresAt,
    };
  }

  acquire(
    sessionId: string,
    hostToken: string,
    now = Date.now(),
    options: { force?: boolean } = {},
  ) {
    const existing = this.getSnapshot(sessionId, now);

    if (existing.status === "readonly" && !options.force) {
      throw new Error("Active host lock is still unexpired. Use explicit force takeover.");
    }

    const lock: HostLockRecord = {
      ownerSessionId: sessionId,
      hostTokenHash: hashHostToken(hostToken),
      acquiredAt: now,
      heartbeatAt: now,
      expiresAt: now + HOST_LOCK_TTL_MS,
    };

    this.lock = lock;

    return {
      takeover: existing.status === "readonly",
      snapshot: this.getSnapshot(sessionId, now),
    };
  }

  refresh(sessionId: string, hostToken: string, now = Date.now()) {
    if (
      !this.lock ||
      this.lock.expiresAt <= now ||
      this.lock.ownerSessionId !== sessionId ||
      this.lock.hostTokenHash !== hashHostToken(hostToken)
    ) {
      return false;
    }

    this.lock = {
      ...this.lock,
      heartbeatAt: now,
      expiresAt: now + HOST_LOCK_TTL_MS,
    };

    return true;
  }

  release(sessionId: string, hostToken: string, now = Date.now()): HostLockReleaseResult {
    if (!this.lock || this.lock.expiresAt <= now) {
      return {
        released: false,
        outcome: "no_active_lock",
        snapshot: this.getSnapshot(sessionId, now),
      };
    }

    if (
      this.lock.ownerSessionId === sessionId &&
      this.lock.hostTokenHash === hashHostToken(hostToken)
    ) {
      this.lock = null;
      return {
        released: true,
        outcome: "released",
        snapshot: this.getSnapshot(sessionId, now),
      };
    }

    return {
      released: false,
      outcome: "not_active_host",
      snapshot: this.getSnapshot(sessionId, now),
    };
  }

  exportSnapshot(): HostLockStoreSnapshot {
    return {
      lock: this.lock ? { ...this.lock } : null,
    };
  }

  importSnapshot(snapshot: HostLockStoreSnapshot) {
    this.lock = snapshot.lock ? { ...snapshot.lock } : null;
  }
}
