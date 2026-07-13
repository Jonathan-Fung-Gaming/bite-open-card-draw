import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_TTL_SECONDS = 30 * 60;
export const HOST_RECOVERY_TTL_SECONDS = 30 * 24 * 60 * 60;
export const ADMIN_SESSION_COOKIE = "bite_admin_session";
export const HOST_TOKEN_COOKIE = "bite_host_token";
export const HOST_RECOVERY_COOKIE = "bite_host_recovery";

export type AdminSessionPayload = {
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

export type HostRecoveryPayload = {
  eventId: string;
  hostTokenHash: string;
  ownerSessionId: string;
  issuedAt: number;
  expiresAt: number;
};

const HOST_RECOVERY_SIGNATURE_CONTEXT = "host-recovery";

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signaturesMatch(actualSignature: string, expectedSignature: string) {
  const actual = Buffer.from(actualSignature);
  const expected = Buffer.from(expectedSignature);

  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

export function createAdminSessionToken(
  secret: string,
  now = Date.now(),
  sessionId: string = randomUUID(),
) {
  const payload: AdminSessionPayload = {
    sessionId,
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

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
  options: { allowExpired?: boolean } = {},
) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload, secret);
  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as AdminSessionPayload;

    if (!options.allowExpired && payload.expiresAt <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createHostRecoveryToken(
  secret: string,
  eventId: string,
  ownerSessionId: string,
  hostTokenHash: string,
  now = Date.now(),
) {
  if (!eventId.trim()) {
    throw new Error("Host recovery event id is required.");
  }

  if (!ownerSessionId) {
    throw new Error("Host recovery owner session id is required.");
  }

  if (!/^[0-9a-f]{64}$/.test(hostTokenHash)) {
    throw new Error("Host recovery token hash must be a lowercase SHA-256 hex digest.");
  }

  const payload: HostRecoveryPayload = {
    eventId,
    hostTokenHash,
    ownerSessionId,
    issuedAt: now,
    expiresAt: now + HOST_RECOVERY_TTL_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${HOST_RECOVERY_SIGNATURE_CONTEXT}.${encodedPayload}`, secret);

  return {
    payload,
    token: `${encodedPayload}.${signature}`,
  };
}

export function verifyHostRecoveryToken(
  token: string | undefined,
  secret: string,
  expectedEventId: string,
  now = Date.now(),
) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature, trailing] = token.split(".");

  if (!encodedPayload || !signature || trailing) {
    return null;
  }

  const expectedSignature = sign(`${HOST_RECOVERY_SIGNATURE_CONTEXT}.${encodedPayload}`, secret);

  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as HostRecoveryPayload;

    if (
      typeof payload.eventId !== "string" ||
      payload.eventId !== expectedEventId ||
      typeof payload.hostTokenHash !== "string" ||
      !/^[0-9a-f]{64}$/.test(payload.hostTokenHash) ||
      typeof payload.ownerSessionId !== "string" ||
      !payload.ownerSessionId ||
      typeof payload.issuedAt !== "number" ||
      !Number.isFinite(payload.issuedAt) ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= payload.issuedAt ||
      payload.expiresAt <= now
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
