/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This file is type-checked by the Supabase Deno 2 runtime at deploy time.
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";

import {
  authenticateScheduler,
  ConfigurationError,
  readRuntimeConfig,
  runReminderBatch,
  SchedulerAuthenticationError,
  type PushTransport,
  type SenderStore,
} from "./sender.ts";

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json(405, { ok: false });

  try {
    const config = readRuntimeConfig(Deno.env.toObject());
    authenticateScheduler(request.headers, config.schedulerToken);
    const supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const store: SenderStore = {
      async claim(nowIso, limit) {
        const { data, error } = await supabase.rpc("protein_claim_due_notifications", {
          p_now: nowIso,
          p_limit: limit,
        });
        if (error) throw new Error("claim_failed");
        return data ?? [];
      },
      async finish(input) {
        const { error } = await supabase.rpc("protein_finish_notification_delivery", {
          p_delivery_id: input.deliveryId,
          p_claim_token: input.claimToken,
          p_status: input.status,
          p_error_code: input.errorCode,
          p_finished_at: input.finishedAtIso,
        });
        if (error) throw new Error("finish_failed");
      },
    };

    const transport: PushTransport = {
      async send(input) {
        const details = webPush.generateRequestDetails(input.subscription, input.payload, {
          TTL: 3_600,
          contentEncoding: "aes128gcm",
          topic: "protein-weight-reminder",
          urgency: "normal",
          vapidDetails: {
            subject: config.vapidSubject,
            publicKey: config.vapidPublicKey,
            privateKey: config.vapidPrivateKey,
          },
        });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), input.timeoutMs);

        try {
          const response = await fetch(details.endpoint, {
            method: details.method,
            headers: details.headers,
            body: details.body,
            signal: controller.signal,
          });
          if (!response.ok)
            throw Object.assign(new Error("push_rejected"), { status: response.status });
        } finally {
          clearTimeout(timer);
        }
      },
    };

    const summary = await runReminderBatch({ store, transport });
    return json(200, summary);
  } catch (error) {
    if (error instanceof SchedulerAuthenticationError) return json(401, { ok: false });
    if (error instanceof ConfigurationError) return json(503, { ok: false });
    return json(503, { ok: false });
  }
});
