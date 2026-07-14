import "server-only";
import { cookies, headers } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  type AdminSessionPayload,
  createAdminSessionToken,
  createHostRecoveryToken,
  HOST_RECOVERY_COOKIE,
  HOST_RECOVERY_TTL_SECONDS,
  HOST_TOKEN_COOKIE,
  verifyAdminSessionToken,
  verifyHostRecoveryToken,
} from "@/lib/admin/session";
import { hashHostToken } from "@/lib/admin/host-lock";
import { verifyAdminPassword } from "@/lib/admin/password";
import { ADMIN_PASSWORD_MAX_LENGTH, assertMaxStringLength } from "@/lib/server/input-limits";
import { assertRateLimit } from "@/lib/server/rate-limit";
import {
  createNormalizedAdminSessionStore,
  shouldUseNormalizedAdminSessions,
} from "@/lib/server/admin-session-store";
import { assertProductionTestFlagsDisabled, isProductionDeploymentEnv } from "@/lib/server/env";
import { getTournamentEventId } from "@/lib/server/env";

function getOptionalEnv(name: keyof NodeJS.ProcessEnv) {
  return process.env[name] || null;
}

function shouldUseSecureCookies() {
  assertProductionTestFlagsDisabled();

  return isProductionDeploymentEnv();
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
  return getAdminSessionFromCookiesInternal();
}

export async function getAdminSessionPayloadFromCookiesForCleanup() {
  return getAdminSessionFromCookiesInternal({
    allowExpired: true,
    validateNormalizedSession: false,
  });
}

async function getAdminSessionFromCookiesInternal(
  options: { allowExpired?: boolean; validateNormalizedSession?: boolean } = {},
) {
  const secret = getOptionalEnv("SESSION_SECRET");

  if (!secret) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const session = verifyAdminSessionToken(token, secret, Date.now(), {
    allowExpired: options.allowExpired,
  });

  if (!session || !token) {
    return null;
  }

  if (
    options.validateNormalizedSession !== false &&
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

/**
 * Verifies the signed, unexpired admin cookie without rotating it or performing
 * a separate normalized-session lookup. Use only when the immediately invoked
 * database transaction revalidates that session's revocation and expiry before
 * it mutates state.
 */
export async function requireAdminSessionForDatabaseValidatedMutation() {
  const session = await getAdminSessionFromCookiesInternal({
    validateNormalizedSession: false,
  });

  if (!session) {
    throw new Error("Admin session required.");
  }

  return session;
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
  const currentSession = session ?? verifyAdminSessionToken(currentToken, sessionSecret);

  if (!currentSession || !currentToken) {
    throw new Error("Admin session required.");
  }

  const refreshedSession = createAdminSessionToken(
    sessionSecret,
    Date.now(),
    currentSession.sessionId,
  );

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
}

export async function setHostTokenCookie(hostToken: string) {
  const cookieStore = await cookies();

  cookieStore.set(HOST_TOKEN_COOKIE, hostToken, getCookieOptions(HOST_RECOVERY_TTL_SECONDS));
}

export async function getHostTokenCookie() {
  const cookieStore = await cookies();

  return cookieStore.get(HOST_TOKEN_COOKIE)?.value ?? null;
}

export async function clearHostTokenCookie() {
  await clearHostCredentials();
}

export async function setHostCredentials(hostToken: string, ownerSessionId: string) {
  const sessionSecret = getOptionalEnv("SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("Admin auth is not configured.");
  }

  const cookieStore = await cookies();
  const recovery = createHostRecoveryToken(
    sessionSecret,
    getTournamentEventId(),
    ownerSessionId,
    hashHostToken(hostToken),
  );

  cookieStore.set(HOST_TOKEN_COOKIE, hostToken, getCookieOptions(HOST_RECOVERY_TTL_SECONDS));
  cookieStore.set(
    HOST_RECOVERY_COOKIE,
    recovery.token,
    getCookieOptions(HOST_RECOVERY_TTL_SECONDS),
  );
}

export async function getVerifiedHostRecoveryProof() {
  const sessionSecret = getOptionalEnv("SESSION_SECRET");

  if (!sessionSecret) {
    return null;
  }

  const cookieStore = await cookies();
  const recovery = verifyHostRecoveryToken(
    cookieStore.get(HOST_RECOVERY_COOKIE)?.value,
    sessionSecret,
    getTournamentEventId(),
  );

  return recovery;
}

export async function clearHostRecoveryCookie() {
  const cookieStore = await cookies();

  cookieStore.delete(HOST_RECOVERY_COOKIE);
}

export async function clearHostCredentials() {
  const cookieStore = await cookies();

  cookieStore.delete(HOST_TOKEN_COOKIE);
  cookieStore.delete(HOST_RECOVERY_COOKIE);
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
