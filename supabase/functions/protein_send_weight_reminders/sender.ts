export const MAX_CLAIM_LIMIT = 25;
export const MAX_SEND_CONCURRENCY = 5;
export const SEND_TIMEOUT_MS = 8_000;

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ERROR_CODE_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,127}$/;

export type DeliveryStatus = "sent" | "invalid_subscription" | "failed";

export type ClaimedDelivery = {
  job_id: string;
  user_id: string;
  delivery_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  reminder_kind: string;
  due_local_date: string;
  source_weight_entry_id: string;
  claim_token: string;
  attempts: number;
};

export type PushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type SenderStore = {
  claim(nowIso: string, limit: number): Promise<ClaimedDelivery[]>;
  finish(input: {
    deliveryId: string;
    claimToken: string;
    status: DeliveryStatus;
    errorCode: string | null;
    finishedAtIso: string;
  }): Promise<void>;
};

export type PushTransport = {
  send(input: {
    subscription: PushSubscription;
    payload: string;
    timeoutMs: number;
  }): Promise<void>;
};

export type SenderSummary = {
  claimed: number;
  sent: number;
  invalidSubscriptions: number;
  failed: number;
  finishFailed: number;
  duplicateClaims: number;
};

export type RuntimeConfig = {
  enabled: true;
  schedulerToken: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
};

type Environment = Record<string, string | undefined>;

export class ConfigurationError extends Error {
  constructor() {
    super("Push sender configuration is unavailable.");
    this.name = "ConfigurationError";
  }
}

export class SchedulerAuthenticationError extends Error {
  constructor() {
    super("Scheduler authentication failed.");
    this.name = "SchedulerAuthenticationError";
  }
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!BASE64URL_PATTERN.test(value)) return null;

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    if (typeof atob === "function") {
      return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    }
  } catch {
    return null;
  }

  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isVapidSubject(value: string): boolean {
  if (value.startsWith("mailto:")) {
    return value.length <= 320 && value.slice(7).includes("@");
  }

  return value.length <= 2_048 && isHttpsUrl(value);
}

function readSecretKey(environment: Environment): string | undefined {
  if (environment.SUPABASE_SECRET_KEY) return environment.SUPABASE_SECRET_KEY;
  if (environment.SUPABASE_SERVICE_ROLE_KEY) return environment.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const keys = JSON.parse(environment.SUPABASE_SECRET_KEYS ?? "") as unknown;
    if (keys && typeof keys === "object") {
      const defaultKey = (keys as Record<string, unknown>).default;
      if (typeof defaultKey === "string") return defaultKey;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function readRuntimeConfig(environment: Environment): RuntimeConfig {
  const schedulerToken = environment.PROTEIN_SCHEDULE_AUTH_TOKEN ?? "";
  const supabaseUrl = environment.SUPABASE_URL ?? "";
  const supabaseSecretKey = readSecretKey(environment) ?? "";
  const vapidSubject = environment.VAPID_SUBJECT ?? "";
  const vapidPublicKey = environment.VAPID_PUBLIC_KEY ?? "";
  const vapidPrivateKey = environment.VAPID_PRIVATE_KEY ?? "";
  const publicBytes = decodeBase64Url(vapidPublicKey);
  const privateBytes = decodeBase64Url(vapidPrivateKey);

  if (
    environment.PROTEIN_SCHEDULED_PUSH_ENABLED !== "true" ||
    schedulerToken.length < 32 ||
    !isHttpsUrl(supabaseUrl) ||
    supabaseSecretKey.length < 32 ||
    !isVapidSubject(vapidSubject) ||
    publicBytes?.length !== 65 ||
    publicBytes[0] !== 4 ||
    privateBytes?.length !== 32
  ) {
    throw new ConfigurationError();
  }

  return {
    enabled: true,
    schedulerToken,
    supabaseUrl,
    supabaseSecretKey,
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey,
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return mismatch === 0;
}

export function authenticateScheduler(headers: Headers, expectedToken: string): void {
  const suppliedToken = headers.get("x-protein-schedule-token") ?? "";

  if (!constantTimeEqual(suppliedToken, expectedToken)) {
    throw new SchedulerAuthenticationError();
  }
}

function validClaim(claim: ClaimedDelivery): boolean {
  const p256dh = decodeBase64Url(claim.p256dh);
  const auth = decodeBase64Url(claim.auth_secret);

  return (
    isHttpsUrl(claim.endpoint) &&
    claim.endpoint.length <= 2_048 &&
    p256dh !== null &&
    p256dh.length === 65 &&
    p256dh[0] === 4 &&
    auth !== null &&
    auth.length >= 16 &&
    claim.delivery_id.length > 0 &&
    claim.claim_token.length > 0
  );
}

function statusCodeFrom(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number" && Number.isInteger(statusCode)) return statusCode;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : null;
}

function classifyFailure(error: unknown): {
  status: Exclude<DeliveryStatus, "sent">;
  errorCode: string;
} {
  const statusCode = statusCodeFrom(error);

  if (statusCode === 404 || statusCode === 410) {
    return { status: "invalid_subscription", errorCode: `push_${statusCode}` };
  }
  if (statusCode === 429) return { status: "failed", errorCode: "push_429" };
  if (statusCode !== null && statusCode >= 500) {
    return { status: "failed", errorCode: "push_5xx" };
  }
  if (statusCode !== null) return { status: "failed", errorCode: "push_rejected" };

  return { status: "failed", errorCode: "push_transport" };
}

function safeErrorCode(errorCode: string): string {
  return ERROR_CODE_PATTERN.test(errorCode) ? errorCode : "push_transport";
}

export function pushPayload(sourceWeightEntryId: string): string {
  return JSON.stringify({ sourceWeightEntryId });
}

async function processClaim(
  claim: ClaimedDelivery,
  store: SenderStore,
  transport: PushTransport,
  now: () => Date,
): Promise<{ status: DeliveryStatus; finishFailed: boolean }> {
  let outcome: { status: DeliveryStatus; errorCode: string | null };

  if (!validClaim(claim)) {
    outcome = { status: "invalid_subscription", errorCode: "invalid_subscription_data" };
  } else {
    try {
      await transport.send({
        subscription: {
          endpoint: claim.endpoint,
          keys: { p256dh: claim.p256dh, auth: claim.auth_secret },
        },
        payload: pushPayload(claim.source_weight_entry_id),
        timeoutMs: SEND_TIMEOUT_MS,
      });
      outcome = { status: "sent", errorCode: null };
    } catch (error) {
      const failure = classifyFailure(error);
      outcome = { status: failure.status, errorCode: safeErrorCode(failure.errorCode) };
    }
  }

  try {
    await store.finish({
      deliveryId: claim.delivery_id,
      claimToken: claim.claim_token,
      status: outcome.status,
      errorCode: outcome.errorCode,
      finishedAtIso: now().toISOString(),
    });
    return { status: outcome.status, finishFailed: false };
  } catch {
    return { status: outcome.status, finishFailed: true };
  }
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function runReminderBatch(input: {
  store: SenderStore;
  transport: PushTransport;
  now?: () => Date;
  limit?: number;
  concurrency?: number;
}): Promise<SenderSummary> {
  const now = input.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(MAX_CLAIM_LIMIT, Math.trunc(input.limit ?? MAX_CLAIM_LIMIT)));
  const concurrency = Math.max(
    1,
    Math.min(MAX_SEND_CONCURRENCY, Math.trunc(input.concurrency ?? MAX_SEND_CONCURRENCY)),
  );
  const claims = await input.store.claim(now().toISOString(), limit);
  const uniqueClaims: ClaimedDelivery[] = [];
  const seenDeliveryIds = new Set<string>();

  for (const claim of claims) {
    if (seenDeliveryIds.has(claim.delivery_id)) continue;
    seenDeliveryIds.add(claim.delivery_id);
    uniqueClaims.push(claim);
  }

  const results = await mapConcurrent(uniqueClaims, concurrency, (claim) =>
    processClaim(claim, input.store, input.transport, now),
  );

  return {
    claimed: uniqueClaims.length,
    sent: results.filter((result) => result.status === "sent").length,
    invalidSubscriptions: results.filter((result) => result.status === "invalid_subscription")
      .length,
    failed: results.filter((result) => result.status === "failed").length,
    finishFailed: results.filter((result) => result.finishFailed).length,
    duplicateClaims: claims.length - uniqueClaims.length,
  };
}
