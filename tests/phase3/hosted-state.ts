import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const PHASE3_EVENT_ID_PATTERN = /^phase3-[a-z0-9-]+$/i;
const HOST_ACTIONS = [
  "host_lock_acquire",
  "host_lock_restore",
  "host_lock_takeover",
  "host_lock_release",
] as const;

type HostAction = (typeof HOST_ACTIONS)[number];

function getHostedConfig() {
  const eventId = process.env.E2E_TOURNAMENT_EVENT_ID;
  const generatedEventId = process.env.E2E_PHASE3_GENERATED_DISPOSABLE_EVENT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!eventId || !generatedEventId || !url || !serviceRoleKey) {
    throw new Error("Phase 3 hosted evidence is missing its generated event or Supabase config.");
  }

  if (
    !PHASE3_EVENT_ID_PATTERN.test(eventId) ||
    eventId !== generatedEventId ||
    process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true" ||
    process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true"
  ) {
    throw new Error("Phase 3 hosted evidence failed its disposable non-production safety check.");
  }

  return { eventId, serviceRoleKey, url };
}

function client() {
  const config = getHostedConfig();

  return {
    eventId: config.eventId,
    supabase: createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

export async function cleanupPhase3HostedEvent() {
  const { eventId, supabase } = client();

  for (const table of ["host_locks", "admin_actions", "admin_sessions"] as const) {
    const { error } = await supabase.from(table).delete().eq("event_id", eventId);

    if (error) {
      throw new Error(`Could not clean Phase 3 ${table}: ${error.message}`);
    }
  }
}

export async function ageHostedHostHealth() {
  const { eventId, supabase } = client();
  const oldHeartbeat = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const oldLegacyExpiry = new Date(Date.now() - 60 * 60_000).toISOString();
  const { error } = await supabase
    .from("host_locks")
    .update({ expires_at: oldLegacyExpiry, heartbeat_at: oldHeartbeat })
    .eq("event_id", eventId)
    .eq("lock_name", "tournament-host");

  if (error) {
    throw new Error(`Could not age Phase 3 host health: ${error.message}`);
  }
}

export async function expectHostedOwner(expectedOwnerSessionId: string | null) {
  const { eventId, supabase } = client();

  await expect
    .poll(async () => {
      const { data, error } = await supabase
        .from("host_locks")
        .select("owner_session_id,released_at")
        .eq("event_id", eventId)
        .eq("lock_name", "tournament-host")
        .maybeSingle();

      if (error) {
        throw new Error(`Could not read Phase 3 host owner: ${error.message}`);
      }

      if (!data || data.released_at) {
        return null;
      }

      return data.owner_session_id;
    })
    .toBe(expectedOwnerSessionId);
}

export async function expectHostedHostAuditCounts(expected: Partial<Record<HostAction, number>>) {
  const { eventId, supabase } = client();

  await expect
    .poll(async () => {
      const { data, error } = await supabase
        .from("admin_actions")
        .select("action_type")
        .eq("event_id", eventId)
        .in("action_type", [...HOST_ACTIONS]);

      if (error) {
        throw new Error(`Could not read Phase 3 host audits: ${error.message}`);
      }

      return Object.fromEntries(
        HOST_ACTIONS.map((action) => [
          action,
          (data ?? []).filter((row) => row.action_type === action).length,
        ]),
      );
    })
    .toMatchObject(expected);
}

export async function expectConcurrentRestoreSingleWinner() {
  const { eventId, supabase } = client();
  const ownerSessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const priorHostTokenHash = "a".repeat(64);
  const nextHostTokenHashes = ["b".repeat(64), "c".repeat(64)] as const;
  const { error: sessionError } = await supabase.from("admin_sessions").insert({
    id: ownerSessionId,
    event_id: eventId,
    session_token_hash: "phase3-concurrent-restore-session",
    last_seen_at: new Date().toISOString(),
    expires_at: expiresAt,
    revoked_at: null,
  });

  if (sessionError) {
    throw new Error(`Could not create concurrent-restore session: ${sessionError.message}`);
  }

  const { error: acquireError } = await supabase.rpc("normalized_acquire_host_lock", {
    p_event_id: eventId,
    p_payload: {
      requestId: randomUUID(),
      mode: "take",
      adminSessionId: ownerSessionId,
      hostTokenHash: priorHostTokenHash,
    },
  });

  if (acquireError) {
    throw new Error(`Could not acquire concurrent-restore host: ${acquireError.message}`);
  }

  const restoreResults = await Promise.all(
    nextHostTokenHashes.map((hostTokenHash) =>
      supabase.rpc("normalized_acquire_host_lock", {
        p_event_id: eventId,
        p_payload: {
          requestId: randomUUID(),
          mode: "restore",
          adminSessionId: ownerSessionId,
          hostTokenHash,
          expectedHostTokenHash: priorHostTokenHash,
          recoveryOwnerSessionId: ownerSessionId,
        },
      }),
    ),
  );

  expect(restoreResults.filter(({ error }) => error === null)).toHaveLength(1);
  expect(restoreResults.filter(({ error }) => error !== null)).toHaveLength(1);
  expect(restoreResults.find(({ error }) => error)?.error?.message).toContain(
    "Recovery proof is stale",
  );

  const { data: host, error: hostError } = await supabase
    .from("host_locks")
    .select("host_token_hash,owner_session_id")
    .eq("event_id", eventId)
    .eq("lock_name", "tournament-host")
    .single();

  if (hostError) {
    throw new Error(`Could not read concurrent-restore host: ${hostError.message}`);
  }

  expect(host.owner_session_id).toBe(ownerSessionId);
  expect(nextHostTokenHashes).toContain(host.host_token_hash);
  await expectHostedHostAuditCounts({ host_lock_acquire: 1, host_lock_restore: 1 });
}
