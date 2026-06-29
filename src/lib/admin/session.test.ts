import { describe, expect, it } from "vitest";
import {
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session";

describe("admin session tokens", () => {
  it("uses a sliding 10-hour inactivity window while preserving the session id", () => {
    const secret = "test-secret";
    const first = createAdminSessionToken(secret, 1_000);
    const refreshed = createAdminSessionToken(secret, 61_000, first.payload.sessionId);
    const verified = verifyAdminSessionToken(refreshed.token, secret, 61_000);

    expect(ADMIN_SESSION_TTL_SECONDS).toBe(10 * 60 * 60);
    expect(refreshed.payload.sessionId).toBe(first.payload.sessionId);
    expect(refreshed.payload.expiresAt).toBe(61_000 + 10 * 60 * 60 * 1000);
    expect(refreshed.payload.expiresAt).toBeGreaterThan(first.payload.expiresAt);
    expect(verified?.sessionId).toBe(first.payload.sessionId);
  });
});
