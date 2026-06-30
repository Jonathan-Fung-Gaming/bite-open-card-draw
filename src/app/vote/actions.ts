"use server";

import { revalidatePath } from "next/cache";
import { adminState } from "@/lib/server/admin-state";
import { getAuthoritativeNowMs } from "@/lib/server/authoritative-clock";
import { assertMaxStringLength, DEVICE_ID_MAX_LENGTH } from "@/lib/server/input-limits";
import {
  getTournamentStateBackend,
  hydrateTournamentState,
  withPersistedVotingState,
} from "@/lib/server/persistence";
import { assertRateLimit } from "@/lib/server/rate-limit";
import { submitNormalizedPlayerBallot } from "@/lib/server/normalized-ballots";
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

function assertPublicIdentifierLengths(input: {
  playerId: string;
  deviceId?: string;
  editToken?: string;
}) {
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

  const nowMs = await getAuthoritativeNowMs();
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const result = adminState.resultStore.getRoundResult(roundNumber);

  return {
    status: snapshot.status,
    canSubmit: snapshot.canSubmit,
    statusLabel: formatVotingStatusLabel(snapshot.status),
    timerText: formatVotingTime(snapshot.remainingMs),
    turnoutText: `Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`,
    eligibleCount: snapshot.eligibleCount,
    submittedCount: snapshot.submittedCount,
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
  await assertRateLimit({
    key: `voter-presence:${input.roundNumber}:${input.playerId}:${input.deviceId}`,
    limit: 12,
    windowMs: 60_000,
    message: "Too many voter presence claims. Try again shortly.",
  });

  return withPersistedVotingState(async () => {
    const nowMs = await getAuthoritativeNowMs();
    const snapshot = getVotingRoundSnapshot(input.roundNumber, nowMs);
    const player = snapshot.eligiblePlayers.find((candidate) => candidate.id === input.playerId);

    if (!player) {
      throw new Error("This start.gg username is not eligible for the open voting window.");
    }

    if (!snapshot.canSubmit) {
      return {
        otherActiveDeviceCount: 0,
        hasOtherActiveDevice: false,
      };
    }

    return adminState.ballotStore.claimVoterPresence({ ...input, nowMs });
  });
}

export async function submitRoundBallotAction(input: PublicSubmitRoundBallotInput) {
  assertPublicIdentifierLengths(input);
  await assertRateLimit({
    key: `ballot-submit:${input.roundNumber}:${input.playerId}:${input.deviceId}`,
    limit: 10,
    windowMs: 60_000,
    message: "Too many ballot changes. Try again shortly.",
  });

  const editTokenHash = hashBallotEditToken(input.editToken);

  if (getTournamentStateBackend() === "supabase") {
    const ballot = await submitNormalizedPlayerBallot({
      roundNumber: input.roundNumber,
      playerId: input.playerId,
      choices: input.choices,
      editTokenHash,
    });

    revalidateTournamentViews(revalidatePath);

    return {
      id: ballot.ballotId,
      roundNumber: input.roundNumber,
      playerId: input.playerId,
      playerStartggUsername: ballot.playerStartggUsername,
      choices: input.choices,
      submittedAt: ballot.submittedAt,
      revision: ballot.revision,
      source: "player" as const,
      manualReason: null,
      manualOverride: false,
      replacedExistingBallot: false,
    };
  }

  const publicBallot = await withPersistedVotingState(async () => {
    const nowMs = await getAuthoritativeNowMs();
    adminState.votingWindowStore.advanceVoting(
      input.roundNumber,
      getSubmittedPlayerIdsForRound(input.roundNumber),
      nowMs,
    );
    const snapshot = getVotingRoundSnapshot(input.roundNumber, nowMs);
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

    adminState.votingWindowStore.advanceVoting(
      input.roundNumber,
      getSubmittedPlayerIdsForRound(input.roundNumber),
      nowMs,
    );
    getVotingRoundSnapshot(input.roundNumber, nowMs);

    return toPublicEditableBallot(ballot);
  });

  revalidateTournamentViews(revalidatePath);

  return publicBallot;
}
