import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_SECONDS,
  HOST_RECOVERY_TTL_SECONDS,
  createAdminSessionToken,
  createHostRecoveryToken,
  verifyAdminSessionToken,
  verifyHostRecoveryToken,
} from "./session";

describe("admin session tokens", () => {
  it("uses a sliding 30-minute inactivity window while preserving the session id", () => {
    const secret = "test-secret";
    const first = createAdminSessionToken(secret, 1_000);
    const refreshed = createAdminSessionToken(secret, 61_000, first.payload.sessionId);
    const verified = verifyAdminSessionToken(refreshed.token, secret, 61_000);

    expect(ADMIN_SESSION_TTL_SECONDS).toBe(30 * 60);
    expect(refreshed.payload.sessionId).toBe(first.payload.sessionId);
    expect(refreshed.payload.expiresAt).toBe(61_000 + 30 * 60 * 1000);
    expect(refreshed.payload.expiresAt).toBeGreaterThan(first.payload.expiresAt);
    expect(verified?.sessionId).toBe(first.payload.sessionId);
  });

  it("rejects expired tokens unless cleanup decoding explicitly allows them", () => {
    const secret = "test-secret";
    const session = createAdminSessionToken(secret, 1_000, "session-id");
    const afterExpiry = session.payload.expiresAt + 1;

    expect(verifyAdminSessionToken(session.token, secret, afterExpiry)).toBeNull();
    expect(
      verifyAdminSessionToken(session.token, secret, afterExpiry, { allowExpired: true })
        ?.sessionId,
    ).toBe("session-id");
  });
});

describe("host recovery tokens", () => {
  const hostTokenHash = "a".repeat(64);

  it("creates a long-lived token bound to the authoritative owner session", () => {
    const recovery = createHostRecoveryToken(
      "test-secret",
      "event-a",
      "owner-session",
      hostTokenHash,
      1_000,
    );

    expect(HOST_RECOVERY_TTL_SECONDS).toBe(30 * 24 * 60 * 60);
    expect(recovery.payload.expiresAt).toBe(1_000 + 30 * 24 * 60 * 60 * 1000);
    expect(verifyHostRecoveryToken(recovery.token, "test-secret", "event-a", 2_000)).toEqual(
      recovery.payload,
    );
    expect(verifyHostRecoveryToken(recovery.token, "test-secret", "event-b", 2_000)).toBeNull();
    expect(recovery.payload.eventId).toBe("event-a");
    expect(recovery.payload.ownerSessionId).toBe("owner-session");
    expect(recovery.payload.hostTokenHash).toBe(hostTokenHash);
  });

  it("rejects expired, tampered, and incorrectly signed recovery tokens", () => {
    const recovery = createHostRecoveryToken(
      "test-secret",
      "event-a",
      "owner-session",
      hostTokenHash,
      1_000,
    );
    const [payload, signature] = recovery.token.split(".");

    expect(
      verifyHostRecoveryToken(recovery.token, "test-secret", "event-a", recovery.payload.expiresAt),
    ).toBeNull();
    expect(verifyHostRecoveryToken(recovery.token, "wrong-secret", "event-a", 2_000)).toBeNull();
    expect(
      verifyHostRecoveryToken(`${payload}x.${signature}`, "test-secret", "event-a", 2_000),
    ).toBeNull();
    expect(
      verifyHostRecoveryToken(`${recovery.token}.extra`, "test-secret", "event-a", 2_000),
    ).toBeNull();
  });

  it("uses a purpose-separated signature that cannot authenticate as an admin session", () => {
    const recovery = createHostRecoveryToken(
      "test-secret",
      "event-a",
      "owner-session",
      hostTokenHash,
      1_000,
    );

    expect(verifyAdminSessionToken(recovery.token, "test-secret", 2_000)).toBeNull();
  });

  it("requires an owner session id when creating recovery proof", () => {
    expect(() =>
      createHostRecoveryToken("test-secret", "event-a", "", hostTokenHash, 1_000),
    ).toThrow("Host recovery owner session id is required.");
    expect(() =>
      createHostRecoveryToken("test-secret", " ", "owner-session", hostTokenHash, 1_000),
    ).toThrow("Host recovery event id is required.");
    expect(() =>
      createHostRecoveryToken("test-secret", "event-a", "owner-session", "bad", 1_000),
    ).toThrow("Host recovery token hash");
  });
});
