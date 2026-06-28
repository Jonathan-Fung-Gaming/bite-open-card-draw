import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_TTL_SECONDS = 30 * 60;
export const ADMIN_SESSION_COOKIE = "bite_admin_session";
export const HOST_TOKEN_COOKIE = "bite_host_token";

export type AdminSessionPayload = {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createAdminSessionToken(secret: string, now = Date.now()) {
  const payload: AdminSessionPayload = {
    sessionId: randomUUID(),
    issuedAt: now,
    expiresAt: now + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);

  return {
    payload,
    token: `${encodedPayload}.${signature}`,
  };
}

export function verifyAdminSessionToken(token: string | undefined, secret: string, now = Date.now()) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.byteLength !== expected.byteLength || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;

    if (payload.expiresAt <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
