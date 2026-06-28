"use server";

import { revalidatePath } from "next/cache";
import { adminState } from "@/lib/server/admin-state";
import {
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
  revalidateTournamentViews,
} from "@/lib/server/voting-round";
import type { SubmitRoundBallotInput } from "@/lib/vote/ballot";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";

export async function getExistingBallotAction(roundNumber: 1 | 2 | 3 | 4, playerId: string) {
  return adminState.ballotStore.get(roundNumber, playerId);
}

export async function getVoteLiveStateAction(roundNumber: 1 | 2 | 3 | 4, playerId?: string) {
  const snapshot = getVotingRoundSnapshot(roundNumber);
  const submittedPlayerIds = getSubmittedPlayerIdsForRound(roundNumber);
  const result = adminState.resultStore.getRoundResult(roundNumber);

  return {
    status: snapshot.status,
    canSubmit: snapshot.canSubmit,
    statusLabel: formatVotingStatusLabel(snapshot.status),
    timerText: formatVotingTime(snapshot.remainingMs),
    turnoutText: `Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`,
    eligiblePlayerIds: snapshot.eligiblePlayers.map((player) => player.id),
    submittedPlayerIds,
    existingBallot: playerId ? adminState.ballotStore.get(roundNumber, playerId) : null,
    resultPhase: result?.revealPhase ?? null,
  };
}

export async function submitRoundBallotAction(input: SubmitRoundBallotInput) {
  const snapshot = getVotingRoundSnapshot(input.roundNumber);
  const player = snapshot.eligiblePlayers.find((candidate) => candidate.id === input.playerId);

  if (!snapshot.canSubmit) {
    throw new Error("Voting is not open for ballot changes.");
  }

  if (!player) {
    throw new Error("This start.gg username is not eligible for the open voting window.");
  }

  const draws = getRoundDrawRecords(input.roundNumber);
  const ballot = adminState.ballotStore.submit(
    {
      ...input,
      playerStartggUsername: player.startggUsername,
    },
    draws,
    snapshot.serverNow,
    { source: "player" },
  );

  getVotingRoundSnapshot(input.roundNumber);
  revalidateTournamentViews(revalidatePath);

  return ballot;
}
