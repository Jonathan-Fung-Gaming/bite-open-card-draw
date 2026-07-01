import { createHash, randomUUID } from "node:crypto";

export const HOST_LOCK_TTL_MS = 60_000;

export type HostLockStatus = "inactive" | "active" | "readonly";

export type HostLockSnapshot = {
  status: HostLockStatus;
  ownerSessionId: string | null;
  heartbeatAt: number | null;
  expiresAt: number | null;
};

type HostLockRecord = {
  ownerSessionId: string;
  hostTokenHash: string;
  acquiredAt: number;
  heartbeatAt: number;
  expiresAt: number;
};

export type HostLockStoreSnapshot = {
  lock: HostLockRecord | null;
};

function hashHostToken(hostToken: string) {
  return createHash("sha256").update(hostToken).digest("hex");
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

  release(sessionId: string, hostToken: string) {
    if (
      this.lock &&
      this.lock.ownerSessionId === sessionId &&
      this.lock.hostTokenHash === hashHostToken(hostToken)
    ) {
      this.lock = null;
      return true;
    }

    return false;
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
