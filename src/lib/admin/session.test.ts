import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
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
