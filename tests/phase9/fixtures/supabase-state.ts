import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HOSTED_REFRESH_TIMEOUT_MS } from "./phase9-env";

type SupabaseE2eConfig = {
  eventId: string;
  serviceRoleKey: string;
  url: string;
};

export function getSupabaseE2eConfig(): SupabaseE2eConfig | null {
  const backend = process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND;

  if (backend !== "supabase") {
    return null;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const eventId = process.env.TOURNAMENT_EVENT_ID ?? process.env.E2E_TOURNAMENT_EVENT_ID;

  if (!url || !serviceRoleKey || !eventId) {
    return null;
  }

  return { eventId, serviceRoleKey, url };
}

function createSupabaseServiceClient(config: SupabaseE2eConfig) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function installSupabaseHostLock(sessionId: string, hostToken: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const supabase = createSupabaseServiceClient(config);
  const { error } = await supabase.from("host_locks").upsert(
    {
      event_id: config.eventId,
      lock_name: "tournament-host",
      admin_session_id: sessionId,
      owner_session_id: sessionId,
      host_token_hash: createHash("sha256").update(hostToken).digest("hex"),
      acquired_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      released_at: null,
    },
    { onConflict: "event_id,lock_name" },
  );

  if (error) {
    throw new Error(`Could not install e2e host lock: ${error.message}`);
  }

  return expiresAt;
}

export async function expectSupabaseBallotsAtLeast(roundNumber: number, expectedCount: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);

  await expect
    .poll(
      async () => {
        const { count, error } = await supabase
          .from("ballots")
          .select("id", { count: "exact", head: true })
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber);

        if (error) {
          throw new Error(`Could not count e2e ballots: ${error.message}`);
        }

        return count ?? 0;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBeGreaterThanOrEqual(expectedCount);

  return true;
}

export async function expectSupabaseVotingStatus(roundNumber: number, expectedStatus: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);

  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from("voting_windows")
          .select("status")
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber)
          .maybeSingle();

        if (error) {
          throw new Error(`Could not load e2e voting status: ${error.message}`);
        }

        return (data as { status?: string } | null)?.status ?? null;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(expectedStatus);

  return true;
}

export async function expectSupabaseRevealPhase(roundNumber: number, expectedPhase: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);

  await expect
    .poll(
      async () => {
        const { data, error } = await supabase
          .from("result_snapshots")
          .select("reveal_phase")
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber)
          .maybeSingle();

        if (error) {
          throw new Error(`Could not load e2e reveal phase: ${error.message}`);
        }

        return (data as { reveal_phase?: string } | null)?.reveal_phase ?? null;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(expectedPhase);

  return true;
}

export async function forceSupabaseFinalReveal(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const now = new Date().toISOString();
  const supabase = createSupabaseServiceClient(config);
  const { error } = await supabase
    .from("result_snapshots")
    .update({
      reveal_phase: "final",
      reveal_phase_started_at: now,
      final_revealed_at: now,
      stage_revealed_at: now,
    })
    .eq("event_id", config.eventId)
    .eq("round_number", roundNumber);

  if (error) {
    throw new Error(`Could not force e2e final reveal: ${error.message}`);
  }

  return true;
}

export async function setSupabaseCurrentRound(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const { error } = await supabase.from("event_runtime_state").upsert(
    {
      event_id: config.eventId,
      current_round: roundNumber,
      rehearsal_mode: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id" },
  );

  if (error) {
    throw new Error(`Could not set e2e current round: ${error.message}`);
  }

  return true;
}
