import { resultRevealPhaseRank, type ResultRevealPhase } from "@/lib/results/reveal-phase-order";
import type { PublicRouteState, PublicTournamentRoute, RoundNumber } from "@/lib/round/round-state";
import type { VotingRoundStatus } from "@/lib/vote/voting-window";

export type PublicRouteDrawFreshness = {
  createdAt: string | null;
  drawId: string;
  roundSetId: string;
  version: number;
};

export type PublicRouteFreshnessInput = {
  activeDrawVersions: readonly PublicRouteDrawFreshness[];
  currentRound: RoundNumber;
  latestBallotRevisionAt: string | null;
  latestTournamentActionAt: string | null;
  latestTournamentActionSequence: number;
  resultComputedAt: string | null;
  resultFinalRevealedAt: string | null;
  resultRevealPhase: ResultRevealPhase | null;
  resultRevealPhaseStartedAt: string | null;
  resultSnapshotId: string | null;
  route: PublicTournamentRoute;
  routeRoundNumber: RoundNumber;
  routeSource: PublicRouteState["source"];
  votingStatus: VotingRoundStatus;
  votingWindowClosedAt: string | null;
  votingWindowOpenedAt: string | null;
  votingWindowUpdatedAt: string | null;
  publicStateGeneration?: number;
  publicStateResultMode?: boolean;
  publicStateTransitionKind?: string;
};

export type PublicRouteFreshnessKey = Omit<
  PublicRouteFreshnessInput,
  "publicStateGeneration" | "publicStateResultMode" | "publicStateTransitionKind"
> & {
  activeDrawKey: string;
  epochMs: number;
  publicStateGeneration: number;
  publicStateResultMode: boolean;
  publicStateTransitionKind: string;
  sequence: string;
};

const VOTING_STATUS_RANK: Record<VotingRoundStatus, number> = {
  not_started: 0,
  drawing: 1,
  ready_to_vote: 2,
  voting_open: 3,
  voting_paused: 3,
  final_30_seconds: 5,
  extension_1_minute: 6,
  voting_closed: 7,
  results_computed: 8,
  results_revealing: 9,
  results_revealed: 10,
  round_complete: 11,
};

function epochMs(value: string | null) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function latestEpochMs(values: readonly (string | null)[]) {
  return Math.max(0, ...values.map(epochMs));
}

function drawKey(draws: readonly PublicRouteDrawFreshness[]) {
  return draws
    .map((draw) => `${draw.roundSetId}:${draw.drawId}:${draw.version}:${draw.createdAt ?? ""}`)
    .sort()
    .join("|");
}

function phaseRank(phase: ResultRevealPhase | null) {
  return phase ? resultRevealPhaseRank(phase) : -1;
}

function compareNumbers(left: number, right: number) {
  return Math.sign(left - right);
}

function latestDrawEpochMs(freshness: PublicRouteFreshnessInput) {
  return latestEpochMs(freshness.activeDrawVersions.map((draw) => draw.createdAt));
}

function resultEpochMs(freshness: PublicRouteFreshnessInput) {
  return latestEpochMs([
    freshness.resultComputedAt,
    freshness.resultRevealPhaseStartedAt,
    freshness.resultFinalRevealedAt,
  ]);
}

function votingWindowEpochMs(freshness: PublicRouteFreshnessInput) {
  return latestEpochMs([
    freshness.votingWindowUpdatedAt,
    freshness.votingWindowOpenedAt,
    freshness.votingWindowClosedAt,
  ]);
}

function tournamentActionEpochMs(freshness: PublicRouteFreshnessInput) {
  return epochMs(freshness.latestTournamentActionAt);
}

function tournamentActionSequence(freshness: PublicRouteFreshnessInput) {
  return Math.max(0, freshness.latestTournamentActionSequence);
}

function compareTournamentAction(
  next: PublicRouteFreshnessInput,
  accepted: PublicRouteFreshnessInput,
) {
  const epochComparison = compareNumbers(
    tournamentActionEpochMs(next),
    tournamentActionEpochMs(accepted),
  );

  if (epochComparison !== 0) {
    return epochComparison;
  }

  return compareNumbers(tournamentActionSequence(next), tournamentActionSequence(accepted));
}

function routeEpochMs(freshness: PublicRouteFreshnessInput) {
  return latestEpochMs([
    freshness.latestTournamentActionAt,
    freshness.latestBallotRevisionAt,
    freshness.votingWindowUpdatedAt,
    freshness.votingWindowOpenedAt,
    freshness.votingWindowClosedAt,
    freshness.resultComputedAt,
    freshness.resultRevealPhaseStartedAt,
    freshness.resultFinalRevealedAt,
    ...freshness.activeDrawVersions.map((draw) => draw.createdAt),
  ]);
}

function compareRouteFreshness(
  next: PublicRouteFreshnessInput,
  accepted: PublicRouteFreshnessInput,
) {
  const routeEpochComparison = compareNumbers(routeEpochMs(next), routeEpochMs(accepted));

  if (routeEpochComparison !== 0) {
    return routeEpochComparison;
  }

  return compareTournamentAction(next, accepted);
}

function votingStatusRank(status: VotingRoundStatus) {
  return VOTING_STATUS_RANK[status];
}

function isRoundOrRouteSourceChange(
  next: PublicRouteFreshnessKey,
  accepted: PublicRouteFreshnessKey,
) {
  return (
    next.currentRound !== accepted.currentRound ||
    next.routeRoundNumber !== accepted.routeRoundNumber ||
    next.routeSource !== accepted.routeSource ||
    next.route !== accepted.route
  );
}

function hasLowerDrawProgress(next: PublicRouteFreshnessKey, accepted: PublicRouteFreshnessKey) {
  if (next.activeDrawVersions.length < accepted.activeDrawVersions.length) {
    return true;
  }

  return next.activeDrawVersions.length === accepted.activeDrawVersions.length
    ? latestDrawEpochMs(next) < latestDrawEpochMs(accepted)
    : false;
}

function isResetLikePayload(freshness: PublicRouteFreshnessKey) {
  return (
    freshness.activeDrawVersions.length === 0 &&
    freshness.resultSnapshotId === null &&
    freshness.resultRevealPhase === null &&
    freshness.votingStatus === "not_started" &&
    freshness.votingWindowOpenedAt === null &&
    freshness.votingWindowClosedAt === null
  );
}

function isNewerReset(next: PublicRouteFreshnessKey, accepted: PublicRouteFreshnessKey) {
  return isResetLikePayload(next) && compareTournamentAction(next, accepted) > 0;
}

function isEmergencyReopen(next: PublicRouteFreshnessKey, accepted: PublicRouteFreshnessKey) {
  if (next.resultSnapshotId !== null || phaseRank(next.resultRevealPhase) >= 0) {
    return false;
  }

  const nextRank = votingStatusRank(next.votingStatus);
  const acceptedRank = votingStatusRank(accepted.votingStatus);
  const reopenedToVotingState =
    next.votingStatus === "ready_to_vote" ||
    next.votingStatus === "voting_open" ||
    next.votingStatus === "voting_paused" ||
    next.votingStatus === "final_30_seconds" ||
    next.votingStatus === "extension_1_minute";

  return (
    reopenedToVotingState &&
    acceptedRank >= VOTING_STATUS_RANK.results_computed &&
    nextRank < acceptedRank &&
    (votingWindowEpochMs(next) > votingWindowEpochMs(accepted) ||
      compareTournamentAction(next, accepted) > 0)
  );
}

function isNewerVotingWindowTransition(
  next: PublicRouteFreshnessKey,
  accepted: PublicRouteFreshnessKey,
) {
  return (
    accepted.resultSnapshotId === null &&
    accepted.resultRevealPhase === null &&
    next.resultSnapshotId === null &&
    next.resultRevealPhase === null &&
    (votingWindowEpochMs(next) > votingWindowEpochMs(accepted) ||
      (votingWindowEpochMs(next) === votingWindowEpochMs(accepted) &&
        compareTournamentAction(next, accepted) > 0))
  );
}

function isComputedResultInvalidation(
  next: PublicRouteFreshnessKey,
  accepted: PublicRouteFreshnessKey,
) {
  const acceptedComputedResult =
    accepted.resultSnapshotId !== null &&
    accepted.resultRevealPhase === "computed" &&
    accepted.votingStatus === "results_computed";

  if (
    !acceptedComputedResult ||
    next.resultSnapshotId !== null ||
    next.resultRevealPhase !== null ||
    compareRouteFreshness(next, accepted) <= 0
  ) {
    return false;
  }

  return (
    next.votingStatus === "voting_closed" ||
    (next.activeDrawVersions.length > 0 &&
      (next.votingStatus === "drawing" || next.votingStatus === "ready_to_vote") &&
      (next.activeDrawKey !== accepted.activeDrawKey ||
        latestDrawEpochMs(next) > latestDrawEpochMs(accepted)))
  );
}

function shouldAcceptRouteChange(next: PublicRouteFreshnessKey, accepted: PublicRouteFreshnessKey) {
  const routeFreshnessComparison = compareRouteFreshness(next, accepted);

  if (next.currentRound < accepted.currentRound && routeFreshnessComparison <= 0) {
    return false;
  }

  return routeFreshnessComparison > 0;
}

export function createPublicRouteFreshnessKey(
  input: PublicRouteFreshnessInput,
): PublicRouteFreshnessKey {
  const publicStateGeneration = Math.max(0, input.publicStateGeneration ?? 0);
  const publicStateResultMode =
    input.publicStateResultMode ??
    (input.resultSnapshotId !== null || input.resultRevealPhase !== null);
  const publicStateTransitionKind = input.publicStateTransitionKind ?? "legacy";
  const activeDrawKey = drawKey(input.activeDrawVersions);
  const epoch = latestEpochMs([
    input.latestTournamentActionAt,
    input.votingWindowUpdatedAt,
    input.votingWindowOpenedAt,
    input.votingWindowClosedAt,
    input.latestBallotRevisionAt,
    input.resultComputedAt,
    input.resultRevealPhaseStartedAt,
    input.resultFinalRevealedAt,
    ...input.activeDrawVersions.map((draw) => draw.createdAt),
  ]);
  const sequence = [
    input.route,
    input.currentRound,
    input.routeRoundNumber,
    input.routeSource,
    input.votingStatus,
    input.votingWindowUpdatedAt ?? "",
    input.resultSnapshotId ?? "",
    input.resultRevealPhase ?? "",
    input.resultRevealPhaseStartedAt ?? "",
    input.latestBallotRevisionAt ?? "",
    input.latestTournamentActionAt ?? "",
    input.latestTournamentActionSequence,
    publicStateGeneration,
    publicStateResultMode ? "result" : "draw",
    publicStateTransitionKind,
    activeDrawKey,
  ].join(";");

  return {
    ...input,
    activeDrawKey,
    epochMs: epoch,
    publicStateGeneration,
    publicStateResultMode,
    publicStateTransitionKind,
    sequence,
  };
}

export function comparePublicRouteFreshness(
  next: PublicRouteFreshnessKey,
  accepted: PublicRouteFreshnessKey,
) {
  const generationComparison = compareNumbers(
    next.publicStateGeneration,
    accepted.publicStateGeneration,
  );

  if (generationComparison !== 0) {
    return generationComparison;
  }

  const epochComparison = compareNumbers(next.epochMs, accepted.epochMs);

  if (epochComparison !== 0) {
    return epochComparison;
  }

  const tournamentActionComparison = compareTournamentAction(next, accepted);

  if (tournamentActionComparison !== 0) {
    return tournamentActionComparison;
  }

  const currentRoundComparison = compareNumbers(next.currentRound, accepted.currentRound);

  if (currentRoundComparison !== 0) {
    return currentRoundComparison;
  }

  const routeRoundComparison = compareNumbers(next.routeRoundNumber, accepted.routeRoundNumber);

  if (routeRoundComparison !== 0) {
    return routeRoundComparison;
  }

  const revealComparison = compareNumbers(
    phaseRank(next.resultRevealPhase),
    phaseRank(accepted.resultRevealPhase),
  );

  if (revealComparison !== 0) {
    return revealComparison;
  }

  return compareNumbers(
    VOTING_STATUS_RANK[next.votingStatus],
    VOTING_STATUS_RANK[accepted.votingStatus],
  );
}

export function shouldAcceptPublicRoutePayload(
  next: PublicRouteFreshnessKey,
  accepted: PublicRouteFreshnessKey,
) {
  if (next.sequence === accepted.sequence) {
    return true;
  }

  // Generations are monotonic within a round, not across rounds. Route/round
  // changes must therefore be ordered by the global action/time evidence first.
  if (isRoundOrRouteSourceChange(next, accepted)) {
    return shouldAcceptRouteChange(next, accepted);
  }

  if (next.publicStateGeneration !== accepted.publicStateGeneration) {
    return next.publicStateGeneration > accepted.publicStateGeneration;
  }

  if (
    isNewerReset(next, accepted) ||
    isEmergencyReopen(next, accepted) ||
    isNewerVotingWindowTransition(next, accepted) ||
    isComputedResultInvalidation(next, accepted)
  ) {
    return true;
  }

  if (accepted.resultSnapshotId !== null && next.resultSnapshotId === null) {
    return false;
  }

  if (next.resultSnapshotId === accepted.resultSnapshotId && next.resultSnapshotId !== null) {
    const nextPhaseRank = phaseRank(next.resultRevealPhase);
    const acceptedPhaseRank = phaseRank(accepted.resultRevealPhase);

    if (nextPhaseRank < acceptedPhaseRank) {
      return false;
    }

    if (nextPhaseRank === acceptedPhaseRank && resultEpochMs(next) < resultEpochMs(accepted)) {
      return false;
    }
  }

  if (
    next.resultSnapshotId !== null &&
    accepted.resultSnapshotId !== null &&
    next.resultSnapshotId !== accepted.resultSnapshotId &&
    resultEpochMs(next) < resultEpochMs(accepted) &&
    compareTournamentAction(next, accepted) <= 0
  ) {
    return false;
  }

  if (hasLowerDrawProgress(next, accepted)) {
    return false;
  }

  const nextVotingRank = votingStatusRank(next.votingStatus);
  const acceptedVotingRank = votingStatusRank(accepted.votingStatus);

  if (nextVotingRank < acceptedVotingRank) {
    return false;
  }

  return comparePublicRouteFreshness(next, accepted) >= 0;
}
