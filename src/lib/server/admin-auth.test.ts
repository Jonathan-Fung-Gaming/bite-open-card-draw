import { afterEach, describe, expect, it, vi } from "vitest";
import { HOST_TOKEN_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import { hashAdminPassword } from "@/lib/admin/password";
import { createAdminSessionCookie, setHostTokenCookie } from "./admin-auth";

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

  return call[2] as { secure: boolean };
}

describe("admin auth cookie security", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
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

  it("does not force Secure cookies outside production deployment semantics", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");

    await setHostTokenCookie("host-token");

    expect(cookieOptionsFor(HOST_TOKEN_COOKIE).secure).toBe(false);
  });
});
