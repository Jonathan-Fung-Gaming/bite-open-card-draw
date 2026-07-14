import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_COOKIE,
  HOST_RECOVERY_COOKIE,
  HOST_RECOVERY_TTL_SECONDS,
  HOST_TOKEN_COOKIE,
  createAdminSessionToken,
  createHostRecoveryToken,
} from "@/lib/admin/session";
import { hashAdminPassword } from "@/lib/admin/password";
import {
  clearAdminCookies,
  clearHostCredentials,
  clearHostTokenCookie,
  createAdminSessionCookie,
  getAdminSessionFromCookies,
  getVerifiedHostRecoveryProof,
  requireAdminSessionForDatabaseValidatedMutation,
  setHostCredentials,
  setHostTokenCookie,
} from "./admin-auth";

vi.mock("server-only", () => ({}));

const nextHeaders = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
  headersStore: {
    get: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => nextHeaders.cookieStore),
  headers: vi.fn(() => nextHeaders.headersStore),
}));

vi.mock("@/lib/server/rate-limit", () => ({
  assertRateLimit: vi.fn(),
}));

vi.mock("@/lib/server/admin-session-store", () => ({
  createNormalizedAdminSessionStore: vi.fn(),
  shouldUseNormalizedAdminSessions: vi.fn(() => false),
}));

function configureAdminAuth() {
  vi.stubEnv("ADMIN_PASSWORD_HASH", hashAdminPassword("correct-password", "phase1salt"));
  vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");
}

function cookieOptionsFor(name: string) {
  const call = nextHeaders.cookieStore.set.mock.calls.find(([cookieName]) => cookieName === name);

  if (!call) {
    throw new Error(`Expected ${name} cookie to be set.`);
  }

  return call[2] as {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
}

describe("admin auth cookie security", () => {
  beforeEach(() => {
    vi.stubEnv("TOURNAMENT_EVENT_ID", "phase-3-test-event");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("sets admin session cookies Secure when VERCEL_ENV is production", async () => {
    configureAdminAuth();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    await createAdminSessionCookie("correct-password");

    expect(cookieOptionsFor(ADMIN_SESSION_COOKIE).secure).toBe(true);
  });

  it("sets host token cookies Secure when VERCEL_ENV is production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    await setHostTokenCookie("host-token");

    expect(cookieOptionsFor(HOST_TOKEN_COOKIE).secure).toBe(true);
  });

  it("sets persistent primary and signed recovery host credentials", async () => {
    vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    await setHostCredentials("host-token", "owner-session");

    expect(cookieOptionsFor(HOST_TOKEN_COOKIE)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: HOST_RECOVERY_TTL_SECONDS,
    });
    expect(cookieOptionsFor(HOST_RECOVERY_COOKIE)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: HOST_RECOVERY_TTL_SECONDS,
    });
    expect(nextHeaders.cookieStore.set).toHaveBeenCalledWith(
      HOST_RECOVERY_COOKIE,
      expect.not.stringContaining("owner-session"),
      expect.any(Object),
    );
  });

  it("does not force Secure cookies outside production deployment semantics", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");

    await setHostTokenCookie("host-token");

    expect(cookieOptionsFor(HOST_TOKEN_COOKIE).secure).toBe(false);
  });

  it("does not authenticate expired admin session cookies", async () => {
    vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");
    const session = createAdminSessionToken("phase-1-session-secret", 1_000);

    vi.useFakeTimers();
    vi.setSystemTime(session.payload.expiresAt + 1);
    nextHeaders.cookieStore.get.mockReturnValue({ value: session.token });

    await expect(getAdminSessionFromCookies()).resolves.toBeNull();
  });

  it("reads a signed session for a database-validated mutation without rotating the cookie", async () => {
    vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");
    const session = createAdminSessionToken("phase-1-session-secret", Date.now());
    nextHeaders.cookieStore.get.mockImplementation((name: string) =>
      name === ADMIN_SESSION_COOKIE ? { value: session.token } : undefined,
    );

    await expect(requireAdminSessionForDatabaseValidatedMutation()).resolves.toEqual(
      session.payload,
    );
    expect(nextHeaders.cookieStore.set).not.toHaveBeenCalled();
  });

  it("reads only valid signed host recovery owner bindings", async () => {
    vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");
    const recovery = createHostRecoveryToken(
      "phase-1-session-secret",
      "phase-3-test-event",
      "owner-session",
      "a".repeat(64),
    );
    nextHeaders.cookieStore.get.mockImplementation((name: string) =>
      name === HOST_RECOVERY_COOKIE ? { value: recovery.token } : undefined,
    );

    await expect(getVerifiedHostRecoveryProof()).resolves.toMatchObject({
      ownerSessionId: "owner-session",
      hostTokenHash: "a".repeat(64),
    });

    nextHeaders.cookieStore.get.mockReturnValue({ value: `${recovery.token}tampered` });
    await expect(getVerifiedHostRecoveryProof()).resolves.toBeNull();
  });

  it("preserves host credentials when clearing an admin session", async () => {
    vi.stubEnv("SESSION_SECRET", "phase-1-session-secret");

    await clearAdminCookies();

    expect(nextHeaders.cookieStore.delete).toHaveBeenCalledWith(ADMIN_SESSION_COOKIE);
    expect(nextHeaders.cookieStore.delete).not.toHaveBeenCalledWith(HOST_TOKEN_COOKIE);
    expect(nextHeaders.cookieStore.delete).not.toHaveBeenCalledWith(HOST_RECOVERY_COOKIE);
  });

  it("clears both host credentials only through the explicit host helper", async () => {
    await clearHostCredentials();

    expect(nextHeaders.cookieStore.delete).toHaveBeenCalledWith(HOST_TOKEN_COOKIE);
    expect(nextHeaders.cookieStore.delete).toHaveBeenCalledWith(HOST_RECOVERY_COOKIE);
  });

  it("keeps the legacy host clear helper safe for explicit release callers", async () => {
    await clearHostTokenCookie();

    expect(nextHeaders.cookieStore.delete).toHaveBeenCalledWith(HOST_TOKEN_COOKIE);
    expect(nextHeaders.cookieStore.delete).toHaveBeenCalledWith(HOST_RECOVERY_COOKIE);
  });
});
