import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  type AdminSessionPayload,
  createAdminSessionToken,
  HOST_TOKEN_COOKIE,
  verifyAdminSessionToken,
} from "@/lib/admin/session";
import { verifyAdminPassword } from "@/lib/admin/password";

function getOptionalEnv(name: keyof NodeJS.ProcessEnv) {
  return process.env[name] || null;
}

function getCookieOptions(maxAge = ADMIN_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function getAdminSessionFromCookies() {
  const secret = getOptionalEnv("SESSION_SECRET");

  if (!secret) {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  return verifyAdminSessionToken(token, secret);
}

export async function requireAdminSession() {
  const session = await getAdminSessionFromCookies();

  if (!session) {
    throw new Error("Admin session required.");
  }

  return refreshAdminSessionCookie(session);
}

export async function createAdminSessionCookie(password: string) {
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

  cookieStore.set(ADMIN_SESSION_COOKIE, session.token, getCookieOptions());

  return session.payload;
}

export async function refreshAdminSessionCookie(session?: AdminSessionPayload) {
  const sessionSecret = getOptionalEnv("SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("Admin auth is not configured.");
  }

  const cookieStore = await cookies();
  const currentSession =
    session ?? verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value, sessionSecret);

  if (!currentSession) {
    throw new Error("Admin session required.");
  }

  const refreshedSession = createAdminSessionToken(sessionSecret, Date.now(), currentSession.sessionId);

  cookieStore.set(ADMIN_SESSION_COOKIE, refreshedSession.token, getCookieOptions());

  return refreshedSession.payload;
}

export async function clearAdminCookies() {
  const cookieStore = await cookies();

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
  const adminPasswordHash = getOptionalEnv("ADMIN_PASSWORD_HASH");

  if (!adminPasswordHash) {
    throw new Error("Admin auth is not configured.");
  }

  if (!verifyAdminPassword(password, adminPasswordHash)) {
    throw new Error("Invalid admin password.");
  }
}
