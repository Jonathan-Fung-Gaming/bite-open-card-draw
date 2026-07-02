import { NextResponse } from "next/server";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { getTournamentEventId } from "@/lib/server/env";
import { getTournamentStateBackend, withPersistedVotingState } from "@/lib/server/persistence";
import { submitNormalizedPlayerBallot } from "@/lib/server/normalized-ballots";
import { createServiceRoleSupabaseClient } from "@/lib/server/supabase";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";
import {
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
} from "@/lib/server/voting-round";
import { hashBallotEditToken } from "@/lib/vote/ballot-privacy";

export const dynamic = "force-dynamic";

type LoadBallotRequest = {
  roundNumber?: unknown;
  playerStartggUsername?: unknown;
  revision?: unknown;
};

type LoadPlayerRow = {
  id: string;
  startgg_username: string;
};

type LoadDrawRow = {
  id: string;
  round_set_id: string;
};

type LoadDrawnChartRow = {
  draw_id: string;
  chart_id: string;
  draw_order: number;
};

function testRouteAvailable(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const token = process.env.TOURNAMENT_TEST_ROUTE_TOKEN;

  if (!token || request.headers.get("x-tournament-test-token") !== token) {
    return false;
  }

  return (
    process.env.TOURNAMENT_TEST_ALLOW_E2E_ROUTES === "true" ||
    (process.env.TOURNAMENT_STATE_BACKEND === "memory" &&
      process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true")
  );
}

function parseRoundNumber(value: unknown) {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value;
  }

  throw new Error("roundNumber must be 1, 2, 3, or 4.");
}

function parsePlayerName(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  throw new Error("playerStartggUsername is required.");
}

function parseRevision(value: unknown) {
  if (value === 1 || value === 2) {
    return value;
  }

  throw new Error("revision must be 1 or 2.");
}

async function submitSupabaseLoadBallot(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerStartggUsername: string;
  revision: 1 | 2;
}) {
  const eventId = getTournamentEventId();
  const supabase = createServiceRoleSupabaseClient();
  const { data: runtimeState, error: runtimeError } = await supabase
    .from("event_runtime_state")
    .select("rehearsal_mode")
    .eq("event_id", eventId)
    .maybeSingle();

  if (runtimeError) {
    throw new Error(`Could not load synthetic load runtime state: ${runtimeError.message}`);
  }

  if (!(runtimeState as { rehearsal_mode?: boolean } | null)?.rehearsal_mode) {
    return { error: "Synthetic load ballots are only available in rehearsal mode.", statusCode: 403 as const };
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id,startgg_username")
    .eq("event_id", eventId)
    .eq("startgg_username", input.playerStartggUsername)
    .maybeSingle();

  if (playerError) {
    throw new Error(`Could not load synthetic load player: ${playerError.message}`);
  }

  if (!player) {
    return { error: "Player is not eligible for this round.", statusCode: 404 as const };
  }

  const loadPlayer = player as LoadPlayerRow;

  const roundSets = ROUND_SET_DEFINITIONS.filter(
    (set) => set.roundNumber === input.roundNumber,
  ).sort((left, right) => left.setOrder - right.setOrder);
  const roundSetIds = roundSets.map((set) => set.id);
  const { data: draws, error: drawsError } = await supabase
    .from("draws")
    .select("id,round_set_id")
    .eq("event_id", eventId)
    .eq("status", "active")
    .in("round_set_id", roundSetIds);

  if (drawsError) {
    throw new Error(`Could not load synthetic load draws: ${drawsError.message}`);
  }

  const loadDraws = (draws ?? []) as LoadDrawRow[];
  const orderedDraws = roundSets.map((set) =>
    loadDraws.find((draw) => draw.round_set_id === set.id),
  );

  if (orderedDraws.some((draw) => !draw)) {
    return { error: "Both chart sets must be drawn before voting.", statusCode: 409 as const };
  }

  const drawIds = orderedDraws.map((draw) => draw?.id ?? "");
  const { data: drawnCharts, error: drawnChartsError } = await supabase
    .from("drawn_charts")
    .select("draw_id,chart_id,draw_order")
    .eq("event_id", eventId)
    .in("draw_id", drawIds)
    .order("draw_order", { ascending: true });

  if (drawnChartsError) {
    throw new Error(`Could not load synthetic load drawn charts: ${drawnChartsError.message}`);
  }

  const loadDrawnCharts = (drawnCharts ?? []) as LoadDrawnChartRow[];
  const choices = orderedDraws.map((draw, drawIndex) => {
    const set = roundSets[drawIndex];
    const chartIds = loadDrawnCharts
      .filter((drawnChart) => drawnChart.draw_id === draw?.id)
      .map((drawnChart) => drawnChart.chart_id);
    const useEditedBan = input.revision === 2 && drawIndex === 0;

    if (chartIds.length !== 7) {
      return null;
    }

    if (useEditedBan && !chartIds[0]) {
      throw new Error("Synthetic load draw has no chart to ban.");
    }

    return {
      drawId: draw?.id ?? "",
      roundSetId: draw?.round_set_id ?? "",
      displayLabel: set?.displayLabel ?? "",
      noBans: !useEditedBan,
      bannedChartIds: useEditedBan ? [chartIds[0] as string] : [],
    };
  });

  if (choices.some((choice) => !choice)) {
    return {
      error: "Each active chart set must have exactly 7 drawn charts before synthetic voting.",
      statusCode: 409 as const,
    };
  }

  const validatedChoices = choices.filter((choice): choice is NonNullable<typeof choice> =>
    Boolean(choice),
  );

  return submitNormalizedPlayerBallot({
    roundNumber: input.roundNumber,
    playerId: loadPlayer.id,
    choices: validatedChoices,
    editTokenHash: hashBallotEditToken(`e2e-load:${input.roundNumber}:${loadPlayer.id}`),
  });
}

export async function POST(request: Request) {
  if (!testRouteAvailable(request)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as LoadBallotRequest;
    const roundNumber = parseRoundNumber(body.roundNumber);
    const playerStartggUsername = parsePlayerName(body.playerStartggUsername);
    const revision = parseRevision(body.revision);

    if (getTournamentStateBackend() === "supabase") {
      const response = await submitSupabaseLoadBallot({
        roundNumber,
        playerStartggUsername,
        revision,
      });

      if ("error" in response) {
        return NextResponse.json({ error: response.error }, { status: response.statusCode });
      }

      return NextResponse.json(response);
    }

    const response = await withPersistedVotingState(async () => {
      if (!adminState.roundStateStore.getSnapshot().rehearsalMode) {
        return {
          error: "Synthetic load ballots are only available in rehearsal mode.",
          statusCode: 403 as const,
        };
      }

      const nowMs = await getAuthoritativeNowMs();
      adminState.votingWindowStore.advanceVoting(
        roundNumber,
        getSubmittedPlayerIdsForRound(roundNumber),
        nowMs,
      );
      const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);

      if (!snapshot.canSubmit) {
        return { error: "Voting is not open for ballot changes.", statusCode: 409 as const };
      }

      const player = snapshot.eligiblePlayers.find(
        (candidate) => candidate.startggUsername === playerStartggUsername,
      );

      if (!player) {
        return { error: "Player is not eligible for this round.", statusCode: 404 as const };
      }

      const draws = getRoundDrawRecords(roundNumber);

      if (draws.length !== 2 || draws.some((draw) => draw.charts.length !== 7)) {
        return {
          error: "Each chart set must have exactly 7 drawn charts before synthetic voting.",
          statusCode: 409 as const,
        };
      }

      const choices = draws.map((draw, drawIndex) => {
        const useEditedBan = revision === 2 && drawIndex === 0;

        return {
          drawId: draw.id,
          roundSetId: draw.roundSetId,
          displayLabel: draw.displayLabel,
          noBans: !useEditedBan,
          bannedChartIds: useEditedBan ? [draw.charts[0]?.id ?? ""] : [],
        };
      });
      const ballot = adminState.ballotStore.submit(
        {
          roundNumber,
          playerId: player.id,
          playerStartggUsername: player.startggUsername,
          choices,
        },
        draws,
        snapshot.serverNow,
        {
          source: "player",
          editTokenHash: hashBallotEditToken(`e2e-load:${roundNumber}:${player.id}`),
        },
      );

      adminState.votingWindowStore.advanceVoting(
        roundNumber,
        getSubmittedPlayerIdsForRound(roundNumber),
        nowMs,
      );
      const advancedSnapshot = getVotingRoundSnapshot(roundNumber, nowMs);

      return {
        playerStartggUsername: player.startggUsername,
        revision: ballot.revision,
        submittedCount: advancedSnapshot.submittedCount,
        eligibleCount: advancedSnapshot.eligibleCount,
        status: advancedSnapshot.status,
      };
    });

    if ("error" in response) {
      return NextResponse.json({ error: response.error }, { status: response.statusCode });
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit load ballot." },
      { status: 400 },
    );
  }
}
