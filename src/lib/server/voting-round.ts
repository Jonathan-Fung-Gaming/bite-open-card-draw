import "server-only";
import { adminState } from "@/lib/server/admin-state";
import { evaluateRoundDrawReadiness } from "@/lib/draw/round-readiness";
import { selectedSongBlocksFromResultStoreBeforeRound } from "@/lib/results/selected-song-blocks";
import { countBanSelections } from "@/lib/vote/ballot";

function priorSelectedSongBlocksForRound(roundNumber: 1 | 2 | 3 | 4) {
  return selectedSongBlocksFromResultStoreBeforeRound(adminState.resultStore, roundNumber);
}

export function getRoundDrawRecords(roundNumber: 1 | 2 | 3 | 4) {
  return adminState.drawStateStore
    .getRoundDraws(roundNumber)
    .filter((draw): draw is NonNullable<typeof draw> => draw !== null);
}

export function getCurrentEligiblePlayers(roundNumber: 1 | 2 | 3 | 4) {
  return adminState.rosterStore.listEligiblePlayersForRound(roundNumber).map((player) => ({
    id: player.id,
    startggUsername: player.startggUsername,
  }));
}

export function getVotingRoundSnapshot(roundNumber: 1 | 2 | 3 | 4, nowMs?: number) {
  const draws = getRoundDrawRecords(roundNumber);
  const drawReadiness = evaluateRoundDrawReadiness(roundNumber, draws, {
    priorSelectedSongBlocks: priorSelectedSongBlocksForRound(roundNumber),
  });
  const drawnSetCountForVotingState = drawReadiness.isReady
    ? drawReadiness.completeSetCount
    : Math.min(drawReadiness.completeSetCount, drawReadiness.expectedSetCount - 1);
  const ballots = adminState.ballotStore.listForRound(roundNumber);

  return adminState.votingWindowStore.getSnapshot({
    roundNumber,
    drawnSetCount: drawnSetCountForVotingState,
    eligiblePlayers: getCurrentEligiblePlayers(roundNumber),
    submittedPlayerIds: ballots.map((ballot) => ballot.playerId),
    banSelectionsCast: countBanSelections(ballots),
    nowMs,
  });
}

export function getRoundDrawReadiness(roundNumber: 1 | 2 | 3 | 4) {
  return evaluateRoundDrawReadiness(roundNumber, getRoundDrawRecords(roundNumber), {
    priorSelectedSongBlocks: priorSelectedSongBlocksForRound(roundNumber),
  });
}

export function getSubmittedPlayerIdsForRound(roundNumber: 1 | 2 | 3 | 4) {
  return adminState.ballotStore.listForRound(roundNumber).map((ballot) => ballot.playerId);
}

export function revalidateTournamentViews(revalidatePath: (path: string) => void) {
  revalidatePath("/coolguy69");
  revalidatePath("/stage");
  revalidatePath("/vote");
  revalidatePath("/charts");
  revalidatePath("/results");
}
