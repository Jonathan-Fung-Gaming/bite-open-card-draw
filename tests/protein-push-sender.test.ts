import { describe, expect, it, vi } from "vitest";

import {
  authenticateScheduler,
  ConfigurationError,
  MAX_CLAIM_LIMIT,
  MAX_SEND_CONCURRENCY,
  pushPayload,
  readRuntimeConfig,
  runReminderBatch,
  SchedulerAuthenticationError,
  SEND_TIMEOUT_MS,
  type ClaimedDelivery,
  type PushTransport,
  type SenderStore,
} from "../supabase/functions/protein_send_weight_reminders/sender";

const PUBLIC_KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");
const PRIVATE_KEY = Buffer.alloc(32, 2).toString("base64url");
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 3)]).toString("base64url");
const AUTH = Buffer.alloc(16, 4).toString("base64url");
const FIXED_NOW = new Date("2026-07-23T08:00:00.000Z");

function claim(index: number, overrides: Partial<ClaimedDelivery> = {}): ClaimedDelivery {
  return {
    job_id: `job-${index}`,
    user_id: `user-${index}`,
    delivery_id: `delivery-${index}`,
    subscription_id: `subscription-${index}`,
    endpoint: `https://push.example.test/${index}`,
    p256dh: P256DH,
    auth_secret: AUTH,
    reminder_kind: "weight_reminder",
    due_local_date: "2026-07-23",
    source_weight_entry_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    claim_token: `claim-token-${index}`,
    attempts: 1,
    ...overrides,
  };
}

function storeWithClaims(claims: ClaimedDelivery[]): {
  store: SenderStore;
  finish: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
} {
  const finish = vi.fn(async () => undefined);
  const claimMock = vi.fn(async () => claims);
  return { store: { claim: claimMock, finish }, finish, claim: claimMock };
}

describe("scheduled push sender configuration", () => {
  const validEnvironment = {
    PROTEIN_SCHEDULED_PUSH_ENABLED: "true",
    PROTEIN_SCHEDULE_AUTH_TOKEN: "s".repeat(32),
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SECRET_KEY: "k".repeat(32),
    VAPID_SUBJECT: "mailto:push@example.test",
    VAPID_PUBLIC_KEY: PUBLIC_KEY,
    VAPID_PRIVATE_KEY: PRIVATE_KEY,
  };

  it("fails closed unless the feature flag and all server secrets are valid", () => {
    expect(() => readRuntimeConfig(validEnvironment)).not.toThrow();

    for (const key of Object.keys(validEnvironment)) {
      expect(() => readRuntimeConfig({ ...validEnvironment, [key]: "" }), key).toThrow(
        ConfigurationError,
      );
    }
    expect(() =>
      readRuntimeConfig({ ...validEnvironment, PROTEIN_SCHEDULED_PUSH_ENABLED: "TRUE" }),
    ).toThrow(ConfigurationError);
  });

  it("requires the exact scheduler token without overloading platform authorization", () => {
    const token = "t".repeat(32);
    expect(() =>
      authenticateScheduler(new Headers({ "x-protein-schedule-token": token }), token),
    ).not.toThrow();
    expect(() =>
      authenticateScheduler(new Headers({ "x-protein-schedule-token": "wrong" }), token),
    ).toThrow(SchedulerAuthenticationError);
    expect(() => authenticateScheduler(new Headers(), token)).toThrow(SchedulerAuthenticationError);
  });
});

describe("scheduled push sender batch", () => {
  it("uses the bounded claim, generic payload, fixed timeout, and finishes successful claims", async () => {
    const fixture = storeWithClaims([claim(1)]);
    const sent: Array<Parameters<PushTransport["send"]>[0]> = [];
    const send = vi.fn(async (input: Parameters<PushTransport["send"]>[0]) => {
      sent.push(input);
    });

    const summary = await runReminderBatch({
      store: fixture.store,
      transport: { send },
      now: () => FIXED_NOW,
      limit: 999,
      concurrency: 999,
    });

    expect(fixture.claim).toHaveBeenCalledWith(FIXED_NOW.toISOString(), MAX_CLAIM_LIMIT);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: pushPayload("00000000-0000-4000-8000-000000000001"),
        timeoutMs: SEND_TIMEOUT_MS,
      }),
    );
    expect(JSON.parse(sent[0]?.payload ?? "null")).toEqual({
      sourceWeightEntryId: "00000000-0000-4000-8000-000000000001",
    });
    expect(fixture.finish).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      claimToken: "claim-token-1",
      status: "sent",
      errorCode: null,
      finishedAtIso: FIXED_NOW.toISOString(),
    });
    expect(summary).toEqual({
      claimed: 1,
      sent: 1,
      invalidSubscriptions: 0,
      failed: 0,
      finishFailed: 0,
      duplicateClaims: 0,
    });
  });

  it("classifies terminal endpoints, transient responses, and other failures and finishes every claim", async () => {
    const fixture = storeWithClaims([claim(1), claim(2), claim(3), claim(4), claim(5), claim(6)]);
    const statuses = [404, 410, 429, 503, 400, null];
    const send = vi.fn(async () => {
      const status = statuses.shift();
      if (status === null) throw new Error("network details must not escape");
      throw Object.assign(new Error("push response details must not escape"), { status });
    });

    const summary = await runReminderBatch({
      store: fixture.store,
      transport: { send },
      now: () => FIXED_NOW,
      concurrency: 1,
    });

    expect(fixture.finish.mock.calls.map(([input]) => [input.status, input.errorCode])).toEqual([
      ["invalid_subscription", "push_404"],
      ["invalid_subscription", "push_410"],
      ["failed", "push_429"],
      ["failed", "push_5xx"],
      ["failed", "push_rejected"],
      ["failed", "push_transport"],
    ]);
    expect(summary).toMatchObject({ claimed: 6, invalidSubscriptions: 2, failed: 4 });
  });

  it("marks malformed stored subscriptions terminal without sending their secrets", async () => {
    const fixture = storeWithClaims([claim(1, { endpoint: "http://unsafe.example.test" })]);
    const send = vi.fn(async () => undefined);

    const summary = await runReminderBatch({ store: fixture.store, transport: { send } });

    expect(send).not.toHaveBeenCalled();
    expect(fixture.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "invalid_subscription",
        errorCode: "invalid_subscription_data",
      }),
    );
    expect(summary.invalidSubscriptions).toBe(1);
  });

  it("does not send a duplicate delivery twice", async () => {
    const duplicate = claim(1, { claim_token: "duplicate-token" });
    const fixture = storeWithClaims([claim(1), duplicate]);
    const send = vi.fn(async () => undefined);

    const summary = await runReminderBatch({ store: fixture.store, transport: { send } });

    expect(send).toHaveBeenCalledTimes(1);
    expect(fixture.finish).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ claimed: 1, sent: 1, duplicateClaims: 1 });
  });

  it("never exceeds the bounded send concurrency", async () => {
    const fixture = storeWithClaims(Array.from({ length: 12 }, (_, index) => claim(index)));
    let active = 0;
    let peak = 0;
    const transport: PushTransport = {
      async send() {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
      },
    };

    await runReminderBatch({
      store: fixture.store,
      transport,
      concurrency: MAX_SEND_CONCURRENCY + 10,
    });

    expect(peak).toBeLessThanOrEqual(MAX_SEND_CONCURRENCY);
    expect(fixture.finish).toHaveBeenCalledTimes(12);
  });

  it("returns only aggregate finish failures when completion recording fails", async () => {
    const fixture = storeWithClaims([claim(1)]);
    fixture.finish.mockRejectedValueOnce(new Error("database details"));

    const summary = await runReminderBatch({
      store: fixture.store,
      transport: { send: vi.fn(async () => undefined) },
    });

    expect(summary).toEqual({
      claimed: 1,
      sent: 1,
      invalidSubscriptions: 0,
      failed: 0,
      finishFailed: 1,
      duplicateClaims: 0,
    });
    expect(JSON.stringify(summary)).not.toContain("delivery-1");
  });
});
