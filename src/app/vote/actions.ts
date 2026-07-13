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
import { claimNormalizedVoterPresence } from "@/lib/server/normalized-voter-presence";
import { advancePublicStateGeneration } from "@/lib/server/public-state-projection";
import {
  advanceVotingTimerIfDue,
  getRoundDrawRecords,
  getSubmittedPlayerIdsForRound,
  getVotingRoundSnapshot,
  revalidateTournamentViews,
} from "@/lib/server/voting-round";
import { type SubmitRoundBallotInput, validateRoundBallot } from "@/lib/vote/ballot";
import {
  BALLOT_EDIT_TOKEN_MAX_LENGTH,
  buildPublicBallotLookup,
  hashBallotEditToken,
  toPublicEditableBallot,
} from "@/lib/vote/ballot-privacy";
import { formatVotingStatusLabel, formatVotingTime } from "@/lib/vote/voting-window";
import { activeDrawGenerationFromDraws, isStaleBallotStateError } from "@/lib/vote/live-generation";

type PublicSubmitRoundBallotInput = Omit<SubmitRoundBallotInput, "playerStartggUsername"> & {
  playerStartggUsername?: string;
  deviceId: string;
  editToken: string;
  expectedGeneration: number;
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
  await advanceVotingTimerIfDue(roundNumber, nowMs);
  const snapshot = getVotingRoundSnapshot(roundNumber, nowMs);
  const result = adminState.resultStore.getRoundResult(roundNumber);
  const draws = getRoundDrawRecords(roundNumber);
  const generation = adminState.publicStateGenerationStore.getRound(roundNumber).generation;

  return {
    status: snapshot.status,
    canSubmit: snapshot.canSubmit,
    statusLabel: formatVotingStatusLabel(snapshot.status),
    timerText: formatVotingTime(snapshot.remainingMs),
    turnoutText: `Ballots submitted: ${snapshot.submittedCount} / ${snapshot.eligibleCount}`,
    eligibleCount: snapshot.eligibleCount,
    submittedCount: snapshot.submittedCount,
    serverNow: snapshot.serverNow,
    closesAt: snapshot.closesAt,
    remainingMs: snapshot.remainingMs,
    existingBallotLookup: playerId
      ? buildPublicBallotLookup(adminState.ballotStore.get(roundNumber, playerId), editToken)
      : null,
    resultPhase: result?.revealPhase ?? null,
    generation,
    activeDraws: activeDrawGenerationFromDraws(draws),
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

  if (getTournamentStateBackend() === "supabase") {
    return claimNormalizedVoterPresence(input);
  }

  await hydrateTournamentState();

  const nowMs = await getAuthoritativeNowMs();
  await advanceVotingTimerIfDue(input.roundNumber, nowMs);

  return withPersistedVotingState(async () => {
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

  try {
    const editTokenHash = hashBallotEditToken(input.editToken);
    if (getTournamentStateBackend() === "supabase") {
      const ballot = await submitNormalizedPlayerBallot({
        roundNumber: input.roundNumber,
        playerId: input.playerId,
        deviceId: input.deviceId,
        choices: input.choices,
        editTokenHash,
        expectedGeneration: input.expectedGeneration,
      });

      revalidateTournamentViews(revalidatePath);

      return {
        status: "saved" as const,
        ballot: {
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
        },
      };
    }

    await hydrateTournamentState();
    const activeDraws = getRoundDrawRecords(input.roundNumber);

    validateRoundBallot(
      {
        roundNumber: input.roundNumber,
        playerId: input.playerId,
        playerStartggUsername: input.playerStartggUsername ?? input.playerId,
        choices: input.choices,
      },
      activeDraws,
    );

    const publicBallot = await withPersistedVotingState(async () => {
      const nowMs = await getAuthoritativeNowMs();
      const projectionBeforeSubmit = adminState.publicStateGenerationStore.getRound(
        input.roundNumber,
      );
      adminState.votingWindowStore.advanceVoting(
        input.roundNumber,
        getSubmittedPlayerIdsForRound(input.roundNumber),
        nowMs,
      );
      const snapshot = getVotingRoundSnapshot(input.roundNumber, nowMs);
      const generation = adminState.publicStateGenerationStore.getRound(
        input.roundNumber,
      ).generation;

      if (generation !== input.expectedGeneration) {
        throw new Error(
          `The ballot draw changed before submission. Expected generation ${input.expectedGeneration}, found ${generation}.`,
        );
      }
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
        { source: "player", deviceId: input.deviceId, editTokenHash },
      );
      adminState.rosterStore.markTournamentHistory(player.id, snapshot.serverNow);

      adminState.votingWindowStore.advanceVoting(
        input.roundNumber,
        getSubmittedPlayerIdsForRound(input.roundNumber),
        nowMs,
      );
      const afterSubmit = getVotingRoundSnapshot(input.roundNumber, nowMs);

      if (
        projectionBeforeSubmit.votingStatus !== afterSubmit.status ||
        projectionBeforeSubmit.votingDeadline !== afterSubmit.closesAt
      ) {
        advancePublicStateGeneration({
          expectedGeneration: projectionBeforeSubmit.generation,
          roundNumber: input.roundNumber,
          transitionKind:
            afterSubmit.status === "final_30_seconds"
              ? "voting_final_warning"
              : "ballot_window_updated",
          updatedAt: new Date(nowMs).toISOString(),
        });
      }

      return toPublicEditableBallot(ballot);
    });

    revalidateTournamentViews(revalidatePath);

    return { status: "saved" as const, ballot: publicBallot };
  } catch (error) {
    if (error instanceof Error && isStaleBallotStateError(error.message)) {
      return { status: "stale" as const };
    }

    throw error;
  }
}
