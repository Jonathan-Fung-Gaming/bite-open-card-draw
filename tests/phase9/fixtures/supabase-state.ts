import { expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HOSTED_REFRESH_TIMEOUT_MS } from "./phase9-env";
import { normalizeStartggUsername } from "../../../src/lib/admin/roster";
import { TIEBREAK_REVEAL_DURATION_MS } from "../../../src/lib/results/reveal-timing";
import { ROUND_SET_DEFINITIONS } from "../../../src/lib/tournament";

type SupabaseE2eConfig = {
  eventId: string;
  serviceRoleKey: string;
  url: string;
};

type BallotRow = {
  id: string;
  player_id: string;
  latest_revision_number: number;
  submitted: boolean;
  invalidated_at: string | null;
};

type BallotChoiceRow = {
  ballot_id: string;
  round_set_id: string;
  no_bans: boolean;
  banned_chart_ids: string[];
};

type DrawRow = {
  id: string;
  round_set_id: string;
  status: string;
};

type PlayerRow = {
  id: string;
  startgg_username: string;
};

type RevealState = {
  revealPhase: string | null;
  revealPhaseStartedAt: string | null;
  resultSnapshotId: string | null;
  votingStatus: string | null;
};

const REHEARSAL_PLAYER_NAMES = Array.from(
  { length: 12 },
  (_, index) => `Rehearsal Player ${String(index + 1).padStart(2, "0")}`,
);

const DISPOSABLE_EVENT_ID_PATTERN = /^(e2e|phase9|load|rehearsal)-[a-z0-9-]+$/i;
const SUPABASE_E2E_HOST_LOCK_TTL_MS = 10 * 60_000;

const REHEARSAL_RESET_TABLES = [
  "active_voter_presence",
  "ballot_revisions",
  "ballot_choices",
  "ballots",
  "ballot_invalidations",
  "round_player_eligibility",
  "voting_windows",
  "tiebreaks",
  "result_rows",
  "result_snapshots",
  "drawn_charts",
  "draws",
  "chart_exclusions",
  "admin_actions",
  "players",
  "event_runtime_state",
] as const;

export function getSupabaseE2eConfig(): SupabaseE2eConfig | null {
  const backend = process.env.E2E_TOURNAMENT_STATE_BACKEND ?? process.env.TOURNAMENT_STATE_BACKEND;

  if (backend !== "supabase") {
    return null;
  }

  const url = process.env.E2E_NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const eventId = process.env.E2E_TOURNAMENT_EVENT_ID ?? process.env.TOURNAMENT_EVENT_ID;

  if (!url || !serviceRoleKey || !eventId) {
    return null;
  }

  return { eventId, serviceRoleKey, url };
}

function assertDisposableSupabaseE2eEvent(eventId: string) {
  if (!DISPOSABLE_EVENT_ID_PATTERN.test(eventId)) {
    throw new Error(
      "Supabase e2e reset requires an event id starting with e2e-, phase9-, load-, or rehearsal-.",
    );
  }

  if (process.env.E2E_ALLOW_DESTRUCTIVE_RESET !== "true") {
    throw new Error("Set E2E_ALLOW_DESTRUCTIVE_RESET=true before running Supabase e2e reset.");
  }
}

function createSupabaseServiceClient(config: SupabaseE2eConfig) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function getSupabaseDatabaseTime(config: SupabaseE2eConfig) {
  const supabase = createSupabaseServiceClient(config);
  const { data, error } = await supabase.rpc("normalized_database_time", {});

  if (error) {
    throw new Error(`Could not read e2e database time: ${error.message}`);
  }

  const nowMs = Date.parse(typeof data === "string" ? data : "");

  if (!Number.isFinite(nowMs)) {
    throw new Error("E2E database time returned an invalid timestamp.");
  }

  return new Date(nowMs);
}

export async function installSupabaseRehearsalState(input: {
  adminSessionId?: string | null;
  reason: string;
}) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  assertDisposableSupabaseE2eEvent(config.eventId);

  const now = await getSupabaseDatabaseTime(config);
  const nowIso = now.toISOString();
  const supabase = createSupabaseServiceClient(config);

  for (const table of REHEARSAL_RESET_TABLES) {
    const { error } = await supabase.from(table).delete().eq("event_id", config.eventId);

    if (error) {
      throw new Error(`Could not reset e2e ${table}: ${error.message}`);
    }
  }

  const { error: playersError } = await supabase.from("players").insert(
    REHEARSAL_PLAYER_NAMES.map((startggUsername) => ({
      id: randomUUID(),
      event_id: config.eventId,
      startgg_username: startggUsername,
      startgg_username_normalized: normalizeStartggUsername(startggUsername),
      active: true,
      has_tournament_history: false,
      created_at: nowIso,
      updated_at: nowIso,
    })),
  );

  if (playersError) {
    throw new Error(`Could not install e2e rehearsal players: ${playersError.message}`);
  }

  const { error: runtimeError } = await supabase.from("event_runtime_state").upsert(
    {
      event_id: config.eventId,
      current_round: 1,
      rehearsal_mode: true,
      updated_at: nowIso,
    },
    { onConflict: "event_id" },
  );

  if (runtimeError) {
    throw new Error(`Could not install e2e rehearsal runtime state: ${runtimeError.message}`);
  }

  const { error: auditError } = await supabase.from("admin_actions").insert({
    event_id: config.eventId,
    admin_session_id: input.adminSessionId ?? null,
    action_type: "start_rehearsal_mode",
    action_summary: "Started e2e rehearsal mode and loaded the disposable rehearsal roster.",
    reason: input.reason,
    requires_password_reentry: true,
    created_at: nowIso,
    metadata: {
      source: "phase9-e2e",
      playerCount: REHEARSAL_PLAYER_NAMES.length,
    },
  });

  if (auditError) {
    throw new Error(`Could not install e2e rehearsal audit row: ${auditError.message}`);
  }

  return true;
}

export async function installSupabaseHostLock(sessionId: string, hostToken: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return null;
  }

  const now = await getSupabaseDatabaseTime(config);
  const expiresAt = new Date(now.getTime() + SUPABASE_E2E_HOST_LOCK_TTL_MS);
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

export async function getSupabaseHostLockDebug(sessionId: string, hostToken: string) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return null;
  }

  const [databaseTime, supabase] = await Promise.all([
    getSupabaseDatabaseTime(config),
    Promise.resolve(createSupabaseServiceClient(config)),
  ]);
  const { data, error } = await supabase
    .from("host_locks")
    .select("owner_session_id,expires_at,released_at,host_token_hash")
    .eq("event_id", config.eventId)
    .eq("lock_name", "tournament-host")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load e2e host lock debug row: ${error.message}`);
  }

  const row = data as {
    expires_at?: string | null;
    host_token_hash?: string | null;
    owner_session_id?: string | null;
    released_at?: string | null;
  } | null;

  return {
    databaseTime: databaseTime.toISOString(),
    expiresAt: row?.expires_at ?? null,
    ownerMatches: row?.owner_session_id === sessionId,
    releasedAt: row?.released_at ?? null,
    tokenHashMatches: row?.host_token_hash === createHash("sha256").update(hostToken).digest("hex"),
  };
}

export async function expectSupabaseRoundDrawsReady(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const roundSets = ROUND_SET_DEFINITIONS.filter((set) => set.roundNumber === roundNumber);

  await expect
    .poll(
      async () => {
        const { data: draws, error: drawsError } = await supabase
          .from("draws")
          .select("id,round_set_id,status")
          .eq("event_id", config.eventId)
          .eq("status", "active")
          .in(
            "round_set_id",
            roundSets.map((set) => set.id),
          );

        if (drawsError) {
          throw new Error(`Could not load e2e active draws: ${drawsError.message}`);
        }

        const drawRows = (draws ?? []) as DrawRow[];

        if (drawRows.length !== 2) {
          return `draws:${drawRows.length}`;
        }

        const { data: drawnCharts, error: drawnChartsError } = await supabase
          .from("drawn_charts")
          .select("draw_id")
          .eq("event_id", config.eventId)
          .in(
            "draw_id",
            drawRows.map((draw) => draw.id),
          );

        if (drawnChartsError) {
          throw new Error(`Could not load e2e drawn charts: ${drawnChartsError.message}`);
        }

        const counts = new Map<string, number>();

        for (const row of (drawnCharts ?? []) as Array<{ draw_id: string }>) {
          counts.set(row.draw_id, (counts.get(row.draw_id) ?? 0) + 1);
        }

        return drawRows
          .map((draw) => counts.get(draw.id) ?? 0)
          .sort((left, right) => left - right)
          .join(",");
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe("7,7");

  return true;
}

export async function expectSupabaseRoundSetDrawReady(roundNumber: number, setOrder: 1 | 2) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const roundSet = ROUND_SET_DEFINITIONS.find(
    (set) => set.roundNumber === roundNumber && set.setOrder === setOrder,
  );

  if (!roundSet) {
    throw new Error(`Unknown Round ${roundNumber} Set ${setOrder}.`);
  }

  await expect
    .poll(
      async () => {
        const { data: draw, error: drawError } = await supabase
          .from("draws")
          .select("id,status")
          .eq("event_id", config.eventId)
          .eq("round_set_id", roundSet.id)
          .eq("status", "active")
          .maybeSingle();

        if (drawError) {
          throw new Error(`Could not load e2e round set draw: ${drawError.message}`);
        }

        const drawId = (draw as { id?: string } | null)?.id;

        if (!drawId) {
          return "draw:none";
        }

        const { count, error: drawnChartsError } = await supabase
          .from("drawn_charts")
          .select("id", { count: "exact", head: true })
          .eq("event_id", config.eventId)
          .eq("draw_id", drawId);

        if (drawnChartsError) {
          throw new Error(`Could not count e2e round set drawn charts: ${drawnChartsError.message}`);
        }

        return count ?? 0;
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(7);

  return true;
}

export async function expectSupabaseSupportedTiebreaks(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const { data: result, error: resultError } = await supabase
    .from("result_snapshots")
    .select("id")
    .eq("event_id", config.eventId)
    .eq("round_number", roundNumber)
    .maybeSingle();

  if (resultError) {
    throw new Error(`Could not load e2e tiebreak result snapshot: ${resultError.message}`);
  }

  const resultSnapshotId = (result as { id?: string } | null)?.id;

  if (!resultSnapshotId) {
    throw new Error(`Round ${roundNumber} has no e2e result snapshot for tiebreak verification.`);
  }

  const { data, error } = await supabase
    .from("tiebreaks")
    .select("candidate_chart_ids")
    .eq("event_id", config.eventId)
    .eq("result_snapshot_id", resultSnapshotId);

  if (error) {
    throw new Error(`Could not load e2e tiebreak candidates: ${error.message}`);
  }

  const candidateCounts = ((data ?? []) as Array<{ candidate_chart_ids: string[] }>).map(
    (row) => row.candidate_chart_ids.length,
  );

  expect(
    candidateCounts.some((count) => count >= 2 && count <= 4),
    `Round ${roundNumber} should exercise a supported 2-4 chart rune-wheel tiebreak.`,
  ).toBe(true);

  return true;
}

export async function expectSupabaseRehearsalBallots(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const expectedPlayers = ["Rehearsal Player 01", "Rehearsal Player 02"];
  const roundSets = ROUND_SET_DEFINITIONS.filter((set) => set.roundNumber === roundNumber).sort(
    (left, right) => left.setOrder - right.setOrder,
  );

  await expect
    .poll(
      async () => {
        const { data: players, error: playerError } = await supabase
          .from("players")
          .select("id,startgg_username")
          .eq("event_id", config.eventId)
          .in("startgg_username", expectedPlayers);

        if (playerError) {
          throw new Error(`Could not load e2e players: ${playerError.message}`);
        }

        const playerRows = (players ?? []) as PlayerRow[];
        const namesById = new Map(playerRows.map((player) => [player.id, player.startgg_username]));

        if (namesById.size !== expectedPlayers.length) {
          return `players:${namesById.size}`;
        }

        const { data: ballots, error: ballotError } = await supabase
          .from("ballots")
          .select("id,player_id,latest_revision_number,submitted,invalidated_at")
          .eq("event_id", config.eventId)
          .eq("round_number", roundNumber)
          .is("invalidated_at", null);

        if (ballotError) {
          throw new Error(`Could not load e2e ballots: ${ballotError.message}`);
        }

        const ballotRows = (ballots ?? []) as BallotRow[];

        if (ballotRows.length !== expectedPlayers.length) {
          return `ballots:${ballotRows.length}`;
        }

        const { data: choices, error: choicesError } = await supabase
          .from("ballot_choices")
          .select("ballot_id,round_set_id,no_bans,banned_chart_ids")
          .eq("event_id", config.eventId)
          .in(
            "ballot_id",
            ballotRows.map((ballot) => ballot.id),
          );

        if (choicesError) {
          throw new Error(`Could not load e2e ballot choices: ${choicesError.message}`);
        }

        const choicesByBallot = new Map<string, BallotChoiceRow[]>();

        for (const choice of (choices ?? []) as BallotChoiceRow[]) {
          choicesByBallot.set(choice.ballot_id, [
            ...(choicesByBallot.get(choice.ballot_id) ?? []),
            choice,
          ]);
        }

        const summaries = ballotRows
          .map((ballot) => {
            const name = namesById.get(ballot.player_id) ?? "unknown";
            const playerChoices = (choicesByBallot.get(ballot.id) ?? []).sort(
              (left, right) =>
                roundSets.findIndex((set) => set.id === left.round_set_id) -
                roundSets.findIndex((set) => set.id === right.round_set_id),
            );

            return [
              name,
              ballot.latest_revision_number,
              ballot.submitted ? "submitted" : "draft",
              ...playerChoices.map((choice) =>
                [
                  choice.no_bans ? "none" : "ban",
                  choice.banned_chart_ids.length,
                ].join(":"),
              ),
            ].join("|");
          })
          .sort();

        return summaries.join("\n");
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(
      [
        "Rehearsal Player 01|2|submitted|ban:2|ban:2",
        "Rehearsal Player 02|1|submitted|ban:2|ban:2",
      ].join("\n"),
    );

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

export async function expectSupabaseVotingStatusIn(
  roundNumber: number,
  expectedStatuses: readonly string[],
) {
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

        const status = (data as { status?: string } | null)?.status ?? null;

        return status !== null && expectedStatuses.includes(status);
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe(true);

  return true;
}

export async function getSupabaseRevealState(roundNumber: number): Promise<RevealState | null> {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return null;
  }

  const supabase = createSupabaseServiceClient(config);
  const [{ data: result, error: resultError }, { data: votingWindow, error: votingError }] =
    await Promise.all([
      supabase
        .from("result_snapshots")
        .select("id,reveal_phase,reveal_phase_started_at")
        .eq("event_id", config.eventId)
        .eq("round_number", roundNumber)
        .maybeSingle(),
      supabase
        .from("voting_windows")
        .select("status")
        .eq("event_id", config.eventId)
        .eq("round_number", roundNumber)
        .maybeSingle(),
    ]);

  if (resultError) {
    throw new Error(`Could not load e2e reveal state: ${resultError.message}`);
  }

  if (votingError) {
    throw new Error(`Could not load e2e voting state: ${votingError.message}`);
  }

  return {
    revealPhase: (result as { reveal_phase?: string } | null)?.reveal_phase ?? null,
    revealPhaseStartedAt:
      (result as { reveal_phase_started_at?: string | null } | null)?.reveal_phase_started_at ??
      null,
    resultSnapshotId: (result as { id?: string } | null)?.id ?? null,
    votingStatus: (votingWindow as { status?: string } | null)?.status ?? null,
  };
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

export async function expectSupabaseFinalRevealComplete(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);

  await expect
    .poll(
      async () => {
        const [{ data: result, error: resultError }, { data: votingWindow, error: votingError }] =
          await Promise.all([
            supabase
              .from("result_snapshots")
              .select("reveal_phase,final_revealed_at")
              .eq("event_id", config.eventId)
              .eq("round_number", roundNumber)
              .maybeSingle(),
            supabase
              .from("voting_windows")
              .select("status")
              .eq("event_id", config.eventId)
              .eq("round_number", roundNumber)
              .maybeSingle(),
          ]);

        if (resultError) {
          throw new Error(`Could not load e2e final reveal: ${resultError.message}`);
        }

        if (votingError) {
          throw new Error(`Could not load e2e final voting status: ${votingError.message}`);
        }

        return [
          (result as { reveal_phase?: string } | null)?.reveal_phase ?? null,
          (result as { final_revealed_at?: string | null } | null)?.final_revealed_at
            ? "final-at"
            : "missing-final-at",
          (votingWindow as { status?: string } | null)?.status ?? null,
        ].join("|");
      },
      { timeout: HOSTED_REFRESH_TIMEOUT_MS },
    )
    .toBe("final|final-at|results_revealed");

  return true;
}

export async function waitForSupabaseTiebreakRevealIfNeeded(
  roundNumber: number,
  phase: string,
) {
  const config = getSupabaseE2eConfig();

  if (!config || (phase !== "set_1_resolved" && phase !== "set_2_resolved")) {
    return false;
  }

  const setOrder = phase === "set_1_resolved" ? 1 : 2;
  const roundSet = ROUND_SET_DEFINITIONS.find(
    (set) => set.roundNumber === roundNumber && set.setOrder === setOrder,
  );

  if (!roundSet) {
    return false;
  }

  const supabase = createSupabaseServiceClient(config);
  const revealState = await getSupabaseRevealState(roundNumber);

  if (!revealState?.resultSnapshotId) {
    return false;
  }

  const { data, error } = await supabase
    .from("tiebreaks")
    .select("winner_reveal_started_at")
    .eq("event_id", config.eventId)
    .eq("result_snapshot_id", revealState.resultSnapshotId)
    .eq("round_set_id", roundSet.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load e2e tiebreak timing: ${error.message}`);
  }

  const startedAt = (data as { winner_reveal_started_at?: string | null } | null)
    ?.winner_reveal_started_at;

  if (!startedAt) {
    return false;
  }

  const databaseTime = await getSupabaseDatabaseTime(config);
  const targetTime = Date.parse(startedAt) + TIEBREAK_REVEAL_DURATION_MS + 500;
  const remainingMs = targetTime - databaseTime.getTime();

  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }

  return true;
}

export async function setSupabaseCurrentRound(roundNumber: number) {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return false;
  }

  const now = await getSupabaseDatabaseTime(config);
  const supabase = createSupabaseServiceClient(config);
  const { error } = await supabase.from("event_runtime_state").upsert(
    {
      event_id: config.eventId,
      current_round: roundNumber,
      rehearsal_mode: true,
      updated_at: now.toISOString(),
    },
    { onConflict: "event_id" },
  );

  if (error) {
    throw new Error(`Could not set e2e current round: ${error.message}`);
  }

  return true;
}

async function countRows(table: "ballots" | "ballot_choices" | "draws" | "drawn_charts") {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return null;
  }

  const supabase = createSupabaseServiceClient(config);
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("event_id", config.eventId);

  if (error) {
    throw new Error(`Could not count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

export async function createSupabasePhase9Diagnostics() {
  const config = getSupabaseE2eConfig();

  if (!config) {
    return { backend: "memory" };
  }

  const supabase = createSupabaseServiceClient(config);
  const [
    votingWindows,
    resultSnapshots,
    recentAdminActions,
    ballotCount,
    ballotChoiceCount,
    drawCount,
    drawnChartCount,
  ] = await Promise.all([
    supabase
      .from("voting_windows")
      .select("round_number,status,opened_at,closed_at,updated_at")
      .eq("event_id", config.eventId)
      .order("round_number", { ascending: true }),
    supabase
      .from("result_snapshots")
      .select("round_number,reveal_phase,reveal_phase_started_at,final_revealed_at")
      .eq("event_id", config.eventId)
      .order("round_number", { ascending: true }),
    supabase
      .from("admin_actions")
      .select("action_type,action_summary,created_at,metadata")
      .eq("event_id", config.eventId)
      .order("created_at", { ascending: false })
      .limit(20),
    countRows("ballots"),
    countRows("ballot_choices"),
    countRows("draws"),
    countRows("drawn_charts"),
  ]);

  for (const [name, result] of [
    ["voting_windows", votingWindows],
    ["result_snapshots", resultSnapshots],
    ["admin_actions", recentAdminActions],
  ] as const) {
    if (result.error) {
      throw new Error(`Could not create ${name} diagnostics: ${result.error.message}`);
    }
  }

  return {
    backend: "supabase",
    eventId: config.eventId,
    counts: {
      ballots: ballotCount,
      ballotChoices: ballotChoiceCount,
      draws: drawCount,
      drawnCharts: drawnChartCount,
    },
    votingWindows: votingWindows.data ?? [],
    resultSnapshots: resultSnapshots.data ?? [],
    recentAdminActions: recentAdminActions.data ?? [],
  };
}
