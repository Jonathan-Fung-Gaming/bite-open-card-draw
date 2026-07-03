import "server-only";
import { adminState } from "@/lib/server/admin-state";
import { evaluateRoundDrawReadiness } from "@/lib/draw/round-readiness";
import { selectedSongBlocksFromResultStoreBeforeRound } from "@/lib/results/selected-song-blocks";
import { countBanSelections } from "@/lib/vote/ballot";
import {
  getTournamentStateBackend,
  hydrateTournamentState,
  withPersistedVotingState,
} from "@/lib/server/persistence";
import { withNormalizedEventPersistenceLock } from "@/lib/server/normalized-operational-state";
import { executeNormalizedTransactionalMutation } from "@/lib/server/transactions/normalized-runtime";
import { isPlayerSubmissionOpen, type VotingWindowRecord } from "@/lib/vote/voting-window";

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

function parseIso(value: string | null) {
  return value ? Date.parse(value) : null;
}

function countSubmittedEligible(
  eligiblePlayers: VotingWindowRecord["eligiblePlayers"],
  submittedPlayerIds: string[],
) {
  const eligibleIds = new Set(eligiblePlayers.map((player) => player.id));
  const submittedIds = new Set(submittedPlayerIds);

  return [...submittedIds].filter((playerId) => eligibleIds.has(playerId)).length;
}

function findVotingWindowRecord(roundNumber: 1 | 2 | 3 | 4) {
  return (
    adminState.votingWindowStore
      .exportSnapshot()
      .windows.find((window) => window.roundNumber === roundNumber) ?? null
  );
}

function normalizedTimerResultChanged(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return false;
  }

  return (result as Record<string, unknown>).changed === true;
}

export function isVotingTimerAdvancementDue(roundNumber: 1 | 2 | 3 | 4, nowMs: number) {
  const record = findVotingWindowRecord(roundNumber);

  if (!record || !isPlayerSubmissionOpen(record.status)) {
    return false;
  }

  const closesAtMs = parseIso(record.closesAt);

  if (closesAtMs !== null && nowMs >= closesAtMs) {
    return true;
  }

  if (record.status === "final_30_seconds" || closesAtMs === null || nowMs >= closesAtMs) {
    return false;
  }

  const submittedCount = countSubmittedEligible(
    record.eligiblePlayers,
    getSubmittedPlayerIdsForRound(roundNumber),
  );

  return record.eligiblePlayers.length > 0 && submittedCount >= record.eligiblePlayers.length;
}

export async function advanceVotingTimerIfDue(roundNumber: 1 | 2 | 3 | 4, nowMs: number) {
  if (!isVotingTimerAdvancementDue(roundNumber, nowMs)) {
    return false;
  }

  if (getTournamentStateBackend() === "supabase") {
    const result = await withNormalizedEventPersistenceLock(() =>
      executeNormalizedTransactionalMutation("advanceVotingTimer", { roundNumber }),
    );
    await hydrateTournamentState();

    return normalizedTimerResultChanged(result);
  }

  return withPersistedVotingState(async () => {
    if (!isVotingTimerAdvancementDue(roundNumber, nowMs)) {
      return false;
    }

    adminState.votingWindowStore.advanceVoting(
      roundNumber,
      getSubmittedPlayerIdsForRound(roundNumber),
      nowMs,
    );

    return true;
  });
}

export function revalidateTournamentViews(revalidatePath: (path: string) => void) {
  revalidatePath("/coolguy69");
  revalidatePath("/stage");
  revalidatePath("/vote");
  revalidatePath("/charts");
  revalidatePath("/results");
}
