import { describe, expect, it } from "vitest";
import { createHostToken, HOST_LOCK_TTL_MS, HostLockStore } from "./host-lock";

describe("host lock store", () => {
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
});
