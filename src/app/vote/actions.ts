"use server";

import { revalidatePath } from "next/cache";
import {
  createOperationalStateSnapshot,
  restoreOperationalStateSnapshot,
} from "@/lib/persistence/operational-state";
import { adminState } from "@/lib/server/admin-state";
import { assertMaxStringLength, DEVICE_ID_MAX_LENGTH } from "@/lib/server/input-limits";
import { hydrateTournamentState, persistTournamentState } from "@/lib/server/persistence";
import { assertRateLimit } from "@/lib/server/rate-limit";
import {
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
  revalidateTournamentViews,
} from "@/lib/server/voting-round";
import type { SubmitRoundBallotInput } from "@/lib/vote/ballot";
import {
  BALLOT_EDIT_TOKEN_MAX_LENGTH,
  buildPublicBallotLookup,
  hashBallotEditToken,
  toPublicEditableBallot,
} from "@/lib/vote/ballot-privacy";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";

type PublicSubmitRoundBallotInput = Omit<SubmitRoundBallotInput, "playerStartggUsername"> & {
  playerStartggUsername?: string;
  deviceId: string;
  editToken: string;
};

function assertPublicIdentifierLengths(input: { playerId: string; deviceId?: string; editToken?: string }) {
  if (!input.playerId.trim()) {
    throw new Error("Player id is required.");
  }

  assertMaxStringLength(input.playerId, "Player id", 200);

  if (input.deviceId !== undefined) {
    if (!input.deviceId.trim()) {
      throw new Error("Device id is required.");
    }

    assertMaxStringLength(input.deviceId, "Device id", DEVICE_ID_MAX_LENGTH);
  }

  if (input.editToken !== undefined) {
    assertMaxStringLength(input.editToken, "Ballot edit token", BALLOT_EDIT_TOKEN_MAX_LENGTH);
  }
}

export async function getExistingBallotAction(
  roundNumber: 1 | 2 | 3 | 4,
  playerId: string,
  editToken?: string,
) {
  assertPublicIdentifierLengths({ playerId, editToken });
  await hydrateTournamentState();

  return buildPublicBallotLookup(adminState.ballotStore.get(roundNumber, playerId), editToken);
}

export async function getVoteLiveStateAction(
  roundNumber: 1 | 2 | 3 | 4,
  playerId?: string,
  editToken?: string,
) {
  if (playerId) {
    assertPublicIdentifierLengths({ playerId, editToken });
  }

  await hydrateTournamentState();

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
    existingBallotLookup: playerId
      ? buildPublicBallotLookup(adminState.ballotStore.get(roundNumber, playerId), editToken)
      : null,
    resultPhase: result?.revealPhase ?? null,
  };
}

export async function claimVoterPresenceAction(input: {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  deviceId: string;
}) {
  assertPublicIdentifierLengths(input);
  assertRateLimit({
    key: `voter-presence:${input.roundNumber}:${input.playerId}:${input.deviceId}`,
    limit: 12,
    windowMs: 60_000,
    message: "Too many voter presence claims. Try again shortly.",
  });

  await hydrateTournamentState();

  const snapshot = getVotingRoundSnapshot(input.roundNumber);
  const player = snapshot.eligiblePlayers.find((candidate) => candidate.id === input.playerId);

  if (!snapshot.canSubmit) {
    throw new Error("Voting is not open for voter presence claims.");
  }

  if (!player) {
    throw new Error("This start.gg username is not eligible for the open voting window.");
  }

  const presence = adminState.ballotStore.claimVoterPresence(input);

  await persistTournamentState();

  return presence;
}

export async function submitRoundBallotAction(input: PublicSubmitRoundBallotInput) {
  assertPublicIdentifierLengths(input);
  assertRateLimit({
    key: `ballot-submit:${input.roundNumber}:${input.playerId}:${input.deviceId}`,
    limit: 10,
    windowMs: 60_000,
    message: "Too many ballot changes. Try again shortly.",
  });

  const editTokenHash = hashBallotEditToken(input.editToken);

  await hydrateTournamentState();
  const rollbackSnapshot = createOperationalStateSnapshot(adminState);

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
    { source: "player", editTokenHash },
  );

  getVotingRoundSnapshot(input.roundNumber);
  try {
    await persistTournamentState();
  } catch (error) {
    restoreOperationalStateSnapshot(adminState, rollbackSnapshot);
    throw error;
  }
  revalidateTournamentViews(revalidatePath);

  return toPublicEditableBallot(ballot);
}
