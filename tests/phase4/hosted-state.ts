import { expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const PHASE4_EVENT_ID_PATTERN = /^phase4-[a-z0-9-]+$/i;

export type Phase4SeedPlayer = {
  id: string;
  startggUsername: string;
  updatedAt: string;
};

function getHostedConfig() {
  const eventId = process.env.E2E_TOURNAMENT_EVENT_ID;
  const generatedEventId = process.env.E2E_PHASE4_GENERATED_DISPOSABLE_EVENT_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!eventId || !generatedEventId || !url || !anonKey || !serviceRoleKey) {
    throw new Error("Phase 4 hosted evidence is missing generated event or Supabase config.");
  }

  if (
    !PHASE4_EVENT_ID_PATTERN.test(eventId) ||
    eventId !== generatedEventId ||
    process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true" ||
    process.env.E2E_CONFIRMED_NON_PRODUCTION_SUPABASE_PROJECT !== "true"
  ) {
    throw new Error("Phase 4 hosted evidence failed its disposable non-production safety check.");
  }

  return { anonKey, eventId, serviceRoleKey, url };
}

function clients() {
  const config = getHostedConfig();
  const options = { auth: { autoRefreshToken: false, persistSession: false } };

  return {
    eventId: config.eventId,
    anon: createClient(config.url, config.anonKey, options),
    service: createClient(config.url, config.serviceRoleKey, options),
  };
}

export async function cleanupPhase4HostedEvent() {
  const { eventId, service } = clients();

  for (const table of [
    "active_voter_presence",
    "voter_device_bindings",
    "ballot_choices",
    "ballot_revisions",
    "ballots",
    "round_player_eligibility",
    "voting_windows",
    "drawn_charts",
    "draws",
    "public_state_generations",
    "players",
    "event_invalidation_generations",
    "host_locks",
    "admin_actions",
    "admin_sessions",
  ] as const) {
    const { error } = await service.from(table).delete().eq("event_id", eventId);

    if (error) {
      throw new Error(`Could not clean Phase 4 ${table}: ${error.message}`);
    }
  }

  const { error: chartCleanupError } = await service
    .from("charts")
    .delete()
    .like("chart_key", `phase4-hosted:${eventId}:%`);

  if (chartCleanupError) {
    throw new Error(`Could not clean Phase 4 chart fixtures: ${chartCleanupError.message}`);
  }
}

export async function seedPhase4Players(count = 48) {
  const { eventId, service } = clients();
  const now = new Date().toISOString();
  const players = Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const startggUsername = `Phase4 Player ${number}`;

    return {
      id: randomUUID(),
      event_id: eventId,
      startgg_username: startggUsername,
      startgg_username_normalized: startggUsername.toLowerCase(),
      active: true,
      has_tournament_history: index === count - 1,
      created_at: now,
      updated_at: now,
    };
  });
  const { error } = await service.from("players").insert(players);

  if (error) {
    throw new Error(`Could not seed Phase 4 players: ${error.message}`);
  }

  const { error: eligibilityError } = await service.from("round_player_eligibility").insert(
    players.map((player) => ({
      id: randomUUID(),
      event_id: eventId,
      round_number: 1,
      player_id: player.id,
      active_at_round_start: true,
      reason: "Phase 4 hosted eligibility snapshot.",
      added_at: now,
      created_at: now,
    })),
  );

  if (eligibilityError) {
    throw new Error(`Could not seed Phase 4 eligibility: ${eligibilityError.message}`);
  }

  return players.map((player): Phase4SeedPlayer => ({
    id: player.id,
    startggUsername: player.startgg_username,
    updatedAt: player.updated_at,
  }));
}

export async function seedPhase4RoundDraws(roundNumber: 1 | 2 | 3 | 4) {
  const { eventId, service } = clients();
  const { data: roundSets, error: roundSetsError } = await service
    .from("round_sets")
    .select("id,set_order,chart_type,chart_level")
    .eq("round_number", roundNumber)
    .order("set_order");

  if (roundSetsError) {
    throw new Error(`Could not read Phase 4 round sets: ${roundSetsError.message}`);
  }

  if (roundSets.length !== 2) {
    throw new Error(`Expected two chart sets for Phase 4 Round ${roundNumber}.`);
  }

  for (const roundSet of roundSets) {
    const chartFixtures = Array.from({ length: 7 }, (_, index) => {
      const fixtureKey = `phase4-hosted:${eventId}:round-${roundNumber}:set-${roundSet.set_order}:chart-${index + 1}`;

      return {
        artist: "Phase 4 hosted fixture",
        chart_key: fixtureKey,
        chart_level: roundSet.chart_level,
        chart_type: roundSet.chart_type as "s" | "d",
        display_difficulty: `${roundSet.chart_type.toUpperCase()}${roundSet.chart_level}`,
        name: `Phase 4 Round ${roundNumber} Set ${roundSet.set_order} Chart ${index + 1}`,
        song_key: `${fixtureKey}:song`,
        tournament_scope: true,
      };
    });
    const { data: selectedCharts, error: chartsError } = await service
      .from("charts")
      .upsert(chartFixtures, { onConflict: "chart_key" })
      .select("id,song_key");

    if (chartsError) {
      throw new Error(`Could not seed Phase 4 chart fixtures: ${chartsError.message}`);
    }

    if (selectedCharts.length !== 7) {
      throw new Error(
        `Expected seven distinct tournament charts for Phase 4 Round ${roundNumber} set ${roundSet.set_order}.`,
      );
    }

    const drawId = randomUUID();
    const chartIds = selectedCharts.map((chart) => chart.id);
    const { error: drawError } = await service.from("draws").insert({
      id: drawId,
      event_id: eventId,
      round_set_id: roundSet.id,
      draw_version: 1,
      status: "active",
      eligible_pool_count: chartIds.length,
      eligible_chart_ids: chartIds,
      excluded_chart_keys_snapshot: [],
      selected_song_keys_snapshot: [],
      same_round_blocked_song_keys_snapshot: [],
      admin_action_id: null,
      reason: "Phase 4 hosted next-round eligibility evidence.",
      superseded_at: null,
    });

    if (drawError) {
      throw new Error(`Could not seed Phase 4 draw: ${drawError.message}`);
    }

    const { error: drawnChartsError } = await service.from("drawn_charts").insert(
      chartIds.map((chartId, index) => ({
        id: randomUUID(),
        event_id: eventId,
        draw_id: drawId,
        chart_id: chartId,
        draw_order: index + 1,
      })),
    );

    if (drawnChartsError) {
      throw new Error(`Could not seed Phase 4 drawn charts: ${drawnChartsError.message}`);
    }
  }
}

export async function openPhase4NextRoundVoting(roundNumber: 1 | 2 | 3 | 4) {
  const { eventId, service } = clients();
  const host = await readHostedHostMutationContext();
  const { error } = await service.rpc("normalized_open_voting_window", {
    p_event_id: eventId,
    p_payload: {
      requestId: randomUUID(),
      adminSessionId: host.adminSessionId,
      hostTokenHash: host.hostTokenHash,
      expectedGeneration: 0,
      roundNumber,
    },
  });

  if (error) {
    throw new Error(`Could not open Phase 4 next-round voting: ${error.message}`);
  }
}

export async function expectPhase4NextRoundEligibility(
  roundNumber: 1 | 2 | 3 | 4,
  expectedCount: number,
) {
  const { eventId, service } = clients();
  const [activePlayers, eligibility] = await Promise.all([
    service.from("players").select("id").eq("event_id", eventId).eq("active", true),
    service
      .from("round_player_eligibility")
      .select("player_id")
      .eq("event_id", eventId)
      .eq("round_number", roundNumber),
  ]);

  if (activePlayers.error || eligibility.error) {
    throw new Error(
      `Could not read Phase 4 next-round eligibility: ${activePlayers.error?.message ?? eligibility.error?.message}`,
    );
  }

  const activePlayerIds = activePlayers.data.map((player) => player.id).sort();
  const eligiblePlayerIds = eligibility.data.map((player) => player.player_id).sort();

  expect(activePlayerIds).toHaveLength(expectedCount);
  expect(eligiblePlayerIds).toEqual(activePlayerIds);
}

export async function expectHostedRosterState(input: {
  activeCount: number;
  auditCount: number;
  eligibilityCount?: number;
  version: number;
}) {
  const { eventId, service } = clients();

  await expect
    .poll(async () => {
      const [players, audits, version, eligibility] = await Promise.all([
        service
          .from("players")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("active", true),
        service
          .from("admin_actions")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("action_type", "roster_active_status_update"),
        service
          .from("event_invalidation_generations")
          .select("version")
          .eq("event_id", eventId)
          .eq("scope", "roster")
          .maybeSingle(),
        service
          .from("round_player_eligibility")
          .select("id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("round_number", 1),
      ]);

      for (const result of [players, audits, version, eligibility]) {
        if (result.error) {
          throw new Error(`Could not read Phase 4 hosted evidence: ${result.error.message}`);
        }
      }

      return {
        activeCount: players.count ?? 0,
        auditCount: audits.count ?? 0,
        eligibilityCount: eligibility.count ?? 0,
        version: version.data?.version ?? 0,
      };
    })
    .toEqual({
      activeCount: input.activeCount,
      auditCount: input.auditCount,
      eligibilityCount: input.eligibilityCount ?? 48,
      version: input.version,
    });
}

export async function expectSanitizedInvalidationBoundary() {
  const { anon, eventId } = clients();
  const { data, error } = await anon
    .from("event_invalidation_generations")
    .select("*")
    .eq("event_id", eventId)
    .eq("scope", "roster")
    .single();

  if (error) {
    throw new Error(`Could not read sanitized Phase 4 invalidation: ${error.message}`);
  }

  expect(Object.keys(data).sort()).toEqual(["event_id", "scope", "updated_at", "version"]);
  expect(data).toMatchObject({ event_id: eventId, scope: "roster" });
  expect(JSON.stringify(data)).not.toMatch(
    /username|player|ballot|password|session|token|secret|credential|hash/i,
  );

  const playerRead = await anon.from("players").select("startgg_username").eq("event_id", eventId);

  expect(playerRead.data ?? []).toEqual([]);

  const unauthorizedMutation = await anon.rpc("normalized_set_roster_player_active_states", {
    p_event_id: eventId,
    p_payload: {},
  });

  expect(unauthorizedMutation.error).not.toBeNull();
}

export async function readHostedHostMutationContext() {
  const { eventId, service } = clients();
  const { data, error } = await service
    .from("host_locks")
    .select("admin_session_id,host_token_hash")
    .eq("event_id", eventId)
    .eq("lock_name", "tournament-host")
    .is("released_at", null)
    .single();

  if (error) {
    throw new Error(`Could not read Phase 4 host mutation context: ${error.message}`);
  }

  return { adminSessionId: data.admin_session_id, hostTokenHash: data.host_token_hash };
}

export async function executeHostedStatusMutation(input: {
  requestId: string;
  expectedVersion: number;
  changes: Array<{ active: boolean; expectedUpdatedAt: string; playerId: string }>;
}) {
  const { eventId, service } = clients();
  const host = await readHostedHostMutationContext();

  return service.rpc("normalized_set_roster_player_active_states", {
    p_event_id: eventId,
    p_payload: {
      requestId: input.requestId,
      adminSessionId: host.adminSessionId,
      hostTokenHash: host.hostTokenHash,
      expectedVersion: input.expectedVersion,
      changes: input.changes,
    },
  });
}

export async function executeHostedRenameMutation(input: {
  expectedUpdatedAt: string;
  expectedVersion: number;
  playerId: string;
  requestId: string;
  startggUsername: string;
}) {
  const { eventId, service } = clients();
  const host = await readHostedHostMutationContext();

  return service.rpc("normalized_rename_roster_player", {
    p_event_id: eventId,
    p_payload: {
      requestId: input.requestId,
      adminSessionId: host.adminSessionId,
      hostTokenHash: host.hostTokenHash,
      expectedVersion: input.expectedVersion,
      playerId: input.playerId,
      expectedUpdatedAt: input.expectedUpdatedAt,
      startggUsername: input.startggUsername,
      startggUsernameNormalized: input.startggUsername.trim().replace(/\s+/g, " ").toLowerCase(),
    },
  });
}

export async function readHostedPlayer(playerId: string) {
  const { eventId, service } = clients();
  const { data, error } = await service
    .from("players")
    .select("startgg_username,active,updated_at")
    .eq("event_id", eventId)
    .eq("id", playerId)
    .single();

  if (error) {
    throw new Error(`Could not read Phase 4 player: ${error.message}`);
  }

  return data;
}
