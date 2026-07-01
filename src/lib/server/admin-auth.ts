import "server-only";
import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  type AdminSessionPayload,
  createAdminSessionToken,
  HOST_TOKEN_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin/session";
import { verifyAdminPassword } from "@/lib/admin/password";
import { ADMIN_PASSWORD_MAX_LENGTH, assertMaxStringLength } from "@/lib/server/input-limits";
import { assertRateLimit } from "@/lib/server/rate-limit";
import {
  createNormalizedAdminSessionStore,
  shouldUseNormalizedAdminSessions,
} from "@/lib/server/admin-session-store";

function getOptionalEnv(name: keyof NodeJS.ProcessEnv) {
  return process.env[name] || null;
}

function shouldUseSecureCookies() {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.TOURNAMENT_TEST_ALLOW_LOCAL_PUBLIC_URL !== "true"
  );
}

function getCookieOptions(maxAge = ADMIN_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(),
    path: "/",
    maxAge,
  };
}

async function getRequestRateLimitKey(scope: string) {
  try {
    const headerStore = await headers();
    const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
    const realIp = headerStore.get("x-real-ip")?.trim();

    return `${scope}:${forwardedFor || realIp || "unknown"}`;
  } catch {
    return `${scope}:unknown`;
  }
}

export async function getAdminSessionFromCookies() {
  const secret = getOptionalEnv("SESSION_SECRET");

  if (!secret) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token, secret);

  if (!session || !token) {
    return null;
  }

  if (
    shouldUseNormalizedAdminSessions() &&
    !(await createNormalizedAdminSessionStore().validate(session, token))
  ) {
    return null;
  }

  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSessionFromCookies();

  if (!session) {
    throw new Error("Admin session required.");
  }

  return refreshAdminSessionCookie(session);
}

export async function createAdminSessionCookie(password: string) {
  assertMaxStringLength(password, "Admin password", ADMIN_PASSWORD_MAX_LENGTH);
  await assertRateLimit({
    key: await getRequestRateLimitKey("admin-login"),
    limit: 12,
    windowMs: 5 * 60 * 1000,
    message: "Too many admin login attempts. Try again shortly.",
  });

  const adminPasswordHash = getOptionalEnv("ADMIN_PASSWORD_HASH");
  const sessionSecret = getOptionalEnv("SESSION_SECRET");

  if (!adminPasswordHash || !sessionSecret) {
    throw new Error("Admin auth is not configured.");
  }

  if (!verifyAdminPassword(password, adminPasswordHash)) {
    throw new Error("Invalid admin password.");
  }

  const cookieStore = await cookies();
  const session = createAdminSessionToken(sessionSecret);

  if (shouldUseNormalizedAdminSessions()) {
    await createNormalizedAdminSessionStore().create(session.payload, session.token);
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, session.token, getCookieOptions());

  return session.payload;
}

export async function refreshAdminSessionCookie(session?: AdminSessionPayload) {
  const sessionSecret = getOptionalEnv("SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("Admin auth is not configured.");
  }

  const cookieStore = await cookies();
  const currentToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const currentSession =
    session ?? verifyAdminSessionToken(currentToken, sessionSecret);

  if (!currentSession || !currentToken) {
    throw new Error("Admin session required.");
  }

  const refreshedSession = createAdminSessionToken(sessionSecret, Date.now(), currentSession.sessionId);

  if (shouldUseNormalizedAdminSessions()) {
    await createNormalizedAdminSessionStore().touch({
      currentSession,
      currentToken,
      refreshedSession: refreshedSession.payload,
      refreshedToken: refreshedSession.token,
    });
  }

  cookieStore.set(ADMIN_SESSION_COOKIE, refreshedSession.token, getCookieOptions());

  return refreshedSession.payload;
}

export async function clearAdminCookies() {
  const cookieStore = await cookies();
  const sessionSecret = getOptionalEnv("SESSION_SECRET");
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = sessionSecret ? verifyAdminSessionToken(token, sessionSecret) : null;

  if (session && token && shouldUseNormalizedAdminSessions()) {
    await createNormalizedAdminSessionStore().revoke(session, token);
  }

  cookieStore.delete(ADMIN_SESSION_COOKIE);
  cookieStore.delete(HOST_TOKEN_COOKIE);
}

export async function setHostTokenCookie(hostToken: string) {
  const cookieStore = await cookies();

  cookieStore.set(HOST_TOKEN_COOKIE, hostToken, getCookieOptions());
}

export async function getHostTokenCookie() {
  const cookieStore = await cookies();

  return cookieStore.get(HOST_TOKEN_COOKIE)?.value ?? null;
}

export async function clearHostTokenCookie() {
  const cookieStore = await cookies();

  cookieStore.delete(HOST_TOKEN_COOKIE);
}

export async function verifyDangerousActionPassword(password: string) {
  assertMaxStringLength(password, "Admin password", ADMIN_PASSWORD_MAX_LENGTH);
  await assertRateLimit({
    key: await getRequestRateLimitKey("dangerous-admin-password"),
    limit: 30,
    windowMs: 5 * 60 * 1000,
    message: "Too many dangerous action password attempts. Try again shortly.",
  });

  const adminPasswordHash = getOptionalEnv("ADMIN_PASSWORD_HASH");

  if (!adminPasswordHash) {
    throw new Error("Admin auth is not configured.");
  }

  if (!verifyAdminPassword(password, adminPasswordHash)) {
    throw new Error("Invalid admin password.");
  }
}
