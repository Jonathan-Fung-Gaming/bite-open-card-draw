import { NextResponse } from "next/server";
import {
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { adminState } from "@/lib/server/admin-state";
import { hydrateTournamentState, persistTournamentState } from "@/lib/server/persistence";
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

function testRouteAvailable() {
  return (
    process.env.TOURNAMENT_STATE_BACKEND === "memory" &&
    process.env.TOURNAMENT_TEST_ALLOW_MEMORY_BACKEND === "true"
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

export async function POST(request: Request) {
  if (!testRouteAvailable()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as LoadBallotRequest;
    const roundNumber = parseRoundNumber(body.roundNumber);
    const playerStartggUsername = parsePlayerName(body.playerStartggUsername);
    const revision = parseRevision(body.revision);

    await hydrateTournamentState();
    const rollbackSnapshot = createOperationalStateSnapshot(adminState);
    const snapshot = getVotingRoundSnapshot(roundNumber);

    if (!snapshot.canSubmit) {
      return NextResponse.json({ error: "Voting is not open for ballot changes." }, { status: 409 });
    }

    const player = snapshot.eligiblePlayers.find(
      (candidate) => candidate.startggUsername === playerStartggUsername,
    );

    if (!player) {
      return NextResponse.json({ error: "Player is not eligible for this round." }, { status: 404 });
    }

    const draws = getRoundDrawRecords(roundNumber);
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
      Date.parse(snapshot.serverNow),
    );
    const advancedSnapshot = getVotingRoundSnapshot(roundNumber);

    try {
      await persistTournamentState();
    } catch (error) {
      restoreOperationalStateSnapshot(adminState, rollbackSnapshot);
      throw error;
    }

    return NextResponse.json({
      playerStartggUsername: player.startggUsername,
      revision: ballot.revision,
      submittedCount: advancedSnapshot.submittedCount,
      eligibleCount: advancedSnapshot.eligibleCount,
      status: advancedSnapshot.status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not submit load ballot." },
      { status: 400 },
    );
  }
}
