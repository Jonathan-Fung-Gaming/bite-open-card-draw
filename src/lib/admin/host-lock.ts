import { createHash, randomUUID } from "node:crypto";

export const HOST_LOCK_COMPATIBILITY_EXPIRES_AT = Date.parse("9999-12-31T23:59:59.999Z");

export type HostLockStatus = "inactive" | "active" | "recoverable" | "readonly";

export type HostLockSnapshot = {
  status: HostLockStatus;
  ownerSessionId: string | null;
  heartbeatAt: number | null;
  expiresAt: number | null;
};

export type HostLockSnapshotOptions = {
  hostToken?: string | null;
  recoveryHostTokenHash?: string | null;
  recoveryOwnerSessionId?: string | null;
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

export type HostLockRestoreOutcome = "restored" | "no_active_lock" | "not_recoverable";

export type HostLockRestoreResult = {
  restored: boolean;
  outcome: HostLockRestoreOutcome;
  snapshot: HostLockSnapshot;
};

export type HostLockPersistenceOutcome =
  | "unchanged"
  | "acquire"
  | "takeover"
  | "restore"
  | "refresh"
  | "release"
  | "stale_acquire"
  | "stale_takeover"
  | "stale_restore"
  | "stale_heartbeat"
  | "stale_release";

export type HostLockPersistenceDecision =
  | {
      action: "write";
      outcome: "acquire" | "takeover" | "restore" | "refresh";
      lock: HostLockRecord;
      snapshot: HostLockStoreSnapshot;
    }
  | {
      action: "delete";
      outcome: "release";
      lock: null;
      snapshot: HostLockStoreSnapshot;
    }
  | {
      action: "noop";
      outcome:
        | "unchanged"
        | "stale_acquire"
        | "stale_takeover"
        | "stale_restore"
        | "stale_heartbeat"
        | "stale_release";
      lock: HostLockRecord | null;
      snapshot: HostLockStoreSnapshot;
    };

type HostLockMutation = "acquire" | "takeover" | "restore" | "refresh";

export function hashHostToken(hostToken: string) {
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

function mutationFromLocks(
  baselineLock: HostLockRecord | null,
  currentLock: HostLockRecord,
): HostLockMutation {
  if (!baselineLock) {
    return "acquire";
  }

  if (sameLockAcquisition(baselineLock, currentLock)) {
    return "refresh";
  }

  if (baselineLock.acquiredAt === currentLock.acquiredAt) {
    return "restore";
  }

  return "takeover";
}

function compareAcquisitions(left: HostLockRecord, right: HostLockRecord) {
  if (left.acquiredAt !== right.acquiredAt) {
    return left.acquiredAt - right.acquiredAt;
  }

  const leftIdentity = `${left.ownerSessionId}\u0000${left.hostTokenHash}`;
  const rightIdentity = `${right.ownerSessionId}\u0000${right.hostTokenHash}`;

  return leftIdentity === rightIdentity ? 0 : leftIdentity > rightIdentity ? 1 : -1;
}

function writeDecision(
  outcome: Extract<HostLockMutation, "acquire" | "takeover" | "restore" | "refresh">,
  lock: HostLockRecord,
): HostLockPersistenceDecision {
  return {
    action: "write",
    outcome,
    lock: { ...lock },
    snapshot: snapshotFromLock(lock),
  };
}

function noopDecision(
  outcome: Extract<HostLockPersistenceOutcome, `stale_${string}` | "unchanged">,
  lock: HostLockRecord | null,
): HostLockPersistenceDecision {
  return {
    action: "noop",
    outcome,
    lock: cloneLock(lock),
    snapshot: snapshotFromLock(lock),
  };
}

export function resolveHostLockPersistence(input: {
  baseline: HostLockStoreSnapshot | null;
  current: HostLockStoreSnapshot;
  latest: HostLockStoreSnapshot | null;
  now?: number;
}): HostLockPersistenceDecision {
  const baseline = input.baseline ?? { lock: null };
  const latest = input.latest ?? { lock: null };
  const baselineLock = baseline.lock;
  const currentLock = input.current.lock;
  const latestLock = latest.lock;

  if (!changed(baseline, input.current)) {
    return noopDecision("unchanged", latestLock);
  }

  if (!currentLock) {
    if (!latestLock) {
      return noopDecision("unchanged", null);
    }

    if (sameLockAcquisition(baselineLock, latestLock)) {
      return {
        action: "delete",
        outcome: "release",
        lock: null,
        snapshot: snapshotFromLock(null),
      };
    }

    return noopDecision("stale_release", latestLock);
  }

  const mutation = mutationFromLocks(baselineLock, currentLock);

  if (mutation === "acquire") {
    if (!latestLock) {
      return writeDecision("acquire", currentLock);
    }

    if (sameLockAcquisition(currentLock, latestLock)) {
      return noopDecision("unchanged", latestLock);
    }

    return noopDecision("stale_acquire", latestLock);
  }

  if (mutation === "refresh") {
    if (!latestLock || !sameLockAcquisition(currentLock, latestLock)) {
      return noopDecision("stale_heartbeat", latestLock);
    }

    if (currentLock.heartbeatAt <= latestLock.heartbeatAt) {
      return noopDecision(
        stableJson(currentLock) === stableJson(latestLock) ? "unchanged" : "stale_heartbeat",
        latestLock,
      );
    }

    return writeDecision("refresh", currentLock);
  }

  if (mutation === "restore") {
    if (latestLock && sameLockAcquisition(currentLock, latestLock)) {
      return noopDecision("unchanged", latestLock);
    }

    if (!latestLock || !sameLockAcquisition(baselineLock, latestLock)) {
      return noopDecision("stale_restore", latestLock);
    }

    return writeDecision("restore", {
      ...currentLock,
      heartbeatAt: Math.max(currentLock.heartbeatAt, latestLock.heartbeatAt),
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    });
  }

  if (!latestLock || compareAcquisitions(currentLock, latestLock) > 0) {
    return writeDecision("takeover", currentLock);
  }

  if (sameLockAcquisition(currentLock, latestLock)) {
    return noopDecision("unchanged", latestLock);
  }

  return noopDecision("stale_takeover", latestLock);
}

export function createHostToken() {
  return randomUUID();
}

export class HostLockStore {
  private lock: HostLockRecord | null = null;

  getSnapshot(
    sessionId: string | null,
    now = Date.now(),
    options: HostLockSnapshotOptions = {},
  ): HostLockSnapshot {
    void now;

    if (!this.lock) {
      return {
        status: "inactive",
        ownerSessionId: null,
        heartbeatAt: null,
        expiresAt: null,
      };
    }

    const sessionOwnsLock = Boolean(sessionId && this.lock.ownerSessionId === sessionId);
    const hostTokenMatches = Boolean(
      sessionOwnsLock &&
      options.hostToken &&
      this.lock.hostTokenHash === hashHostToken(options.hostToken),
    );
    const recoveryOwnerMatches = Boolean(
      sessionId &&
      options.recoveryOwnerSessionId &&
      options.recoveryHostTokenHash &&
      this.lock.ownerSessionId === options.recoveryOwnerSessionId &&
      this.lock.hostTokenHash === options.recoveryHostTokenHash,
    );
    return {
      status: hostTokenMatches
        ? "active"
        : sessionOwnsLock || recoveryOwnerMatches
          ? "recoverable"
          : "readonly",
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
    const existingLock = this.lock;

    if (options.force && !existingLock) {
      throw new Error(
        "There is no active host ownership to force-take. Use normal Take Host Control.",
      );
    }

    if (options.force && existingLock?.ownerSessionId === sessionId) {
      throw new Error("The current owner must use Restore instead of forced takeover.");
    }

    if (existingLock && !options.force) {
      throw new Error("A host owner already exists. Use explicit force takeover.");
    }

    const acquiredAt =
      existingLock && options.force ? Math.max(now, existingLock.acquiredAt + 1) : now;
    const lock: HostLockRecord = {
      ownerSessionId: sessionId,
      hostTokenHash: hashHostToken(hostToken),
      acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    };

    this.lock = lock;

    return {
      takeover: Boolean(existingLock),
      snapshot: this.getSnapshot(sessionId, now, { hostToken }),
    };
  }

  restore(
    sessionId: string,
    newHostToken: string,
    now = Date.now(),
    options: Pick<HostLockSnapshotOptions, "recoveryOwnerSessionId"> & {
      expectedHostTokenHash: string;
    },
  ): HostLockRestoreResult {
    if (!this.lock) {
      return {
        restored: false,
        outcome: "no_active_lock",
        snapshot: this.getSnapshot(sessionId, now),
      };
    }

    const mayRestore =
      this.lock.ownerSessionId === sessionId ||
      (Boolean(options.recoveryOwnerSessionId) &&
        this.lock.ownerSessionId === options.recoveryOwnerSessionId);

    if (!mayRestore) {
      return {
        restored: false,
        outcome: "not_recoverable",
        snapshot: this.getSnapshot(sessionId, now, options),
      };
    }

    if (options.expectedHostTokenHash !== this.lock.hostTokenHash) {
      return {
        restored: false,
        outcome: "not_recoverable",
        snapshot: this.getSnapshot(sessionId, now, options),
      };
    }

    this.lock = {
      ...this.lock,
      ownerSessionId: sessionId,
      hostTokenHash: hashHostToken(newHostToken),
      heartbeatAt: now,
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    };

    return {
      restored: true,
      outcome: "restored",
      snapshot: this.getSnapshot(sessionId, now, { hostToken: newHostToken }),
    };
  }

  refresh(sessionId: string, hostToken: string, now = Date.now()) {
    if (
      !this.lock ||
      this.lock.ownerSessionId !== sessionId ||
      this.lock.hostTokenHash !== hashHostToken(hostToken)
    ) {
      return false;
    }

    this.lock = {
      ...this.lock,
      heartbeatAt: now,
      expiresAt: HOST_LOCK_COMPATIBILITY_EXPIRES_AT,
    };

    return true;
  }

  release(sessionId: string, hostToken: string, now = Date.now()): HostLockReleaseResult {
    if (!this.lock) {
      return {
        released: false,
        outcome: "no_active_lock",
        snapshot: this.getSnapshot(sessionId, now, { hostToken }),
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
        snapshot: this.getSnapshot(sessionId, now, { hostToken }),
      };
    }

    return {
      released: false,
      outcome: "not_active_host",
      snapshot: this.getSnapshot(sessionId, now, { hostToken }),
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
