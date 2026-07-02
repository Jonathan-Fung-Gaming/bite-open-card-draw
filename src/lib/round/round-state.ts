import { formatVotingStatusLabel, type VotingRoundStatus } from "@/lib/vote/voting-window";

export type RoundNumber = 1 | 2 | 3 | 4;

export type RoundStateSnapshot = {
  currentRound: RoundNumber;
  rehearsalMode: boolean;
};

export type RoundChangeGuard = {
  currentRoundStatus: VotingRoundStatus;
};

export type PublicTournamentRoute = "/stage" | "/vote" | "/charts" | "/results";

export type PublicRouteRoundMatrixEntry = {
  roundNumber: RoundNumber;
  status: VotingRoundStatus;
  hasFinalResult?: boolean;
};

export type PublicRouteState = {
  route: PublicTournamentRoute;
  roundNumber: RoundNumber;
  source: "current_round" | "previous_round_result";
  status: VotingRoundStatus;
  showPreviousRoundResult: boolean;
};

export const PUBLIC_ROUTE_STATE_MATRIX: Record<
  PublicTournamentRoute,
  "current_round" | "current_round_or_previous_final_result"
> = {
  "/stage": "current_round",
  "/vote": "current_round",
  "/charts": "current_round",
  "/results": "current_round_or_previous_final_result",
};

const SAFE_ROUND_CHANGE_STATUSES = new Set<VotingRoundStatus>([
  "not_started",
  "results_revealed",
  "round_complete",
]);

const RESULTS_ROUTE_PINNED_TO_CURRENT_STATUSES = new Set<VotingRoundStatus>([
  "voting_open",
  "voting_paused",
  "final_30_seconds",
  "extension_1_minute",
  "voting_closed",
  "results_computed",
  "results_revealing",
  "results_revealed",
  "round_complete",
]);

export function isRoundChangeSafeStatus(status: VotingRoundStatus) {
  return SAFE_ROUND_CHANGE_STATUSES.has(status);
}

export function assertCanChangeCurrentRound(input: {
  currentRound: RoundNumber;
  targetRound: RoundNumber;
  currentRoundStatus: VotingRoundStatus;
}) {
  if (input.currentRound === input.targetRound) {
    return;
  }

  if (isRoundChangeSafeStatus(input.currentRoundStatus)) {
    return;
  }

  throw new Error(
    `Current round changes are blocked while Round ${input.currentRound} is ${formatVotingStatusLabel(
      input.currentRoundStatus,
    ).toLowerCase()}. Complete or reset the round before moving public routes to Round ${
      input.targetRound
    }.`,
  );
}

function getMatrixEntry(
  rounds: readonly PublicRouteRoundMatrixEntry[],
  roundNumber: RoundNumber,
): PublicRouteRoundMatrixEntry {
  return (
    rounds.find((round) => round.roundNumber === roundNumber) ?? {
      roundNumber,
      status: "not_started",
      hasFinalResult: false,
    }
  );
}

function entryHasFinalResult(entry: PublicRouteRoundMatrixEntry) {
  return (
    entry.hasFinalResult === true ||
    entry.status === "results_revealed" ||
    entry.status === "round_complete"
  );
}

function latestPreviousFinalResultRound(
  rounds: readonly PublicRouteRoundMatrixEntry[],
  currentRound: RoundNumber,
) {
  return [...rounds]
    .filter((round) => round.roundNumber < currentRound && entryHasFinalResult(round))
    .sort((left, right) => right.roundNumber - left.roundNumber)[0];
}

export function resolvePublicRouteState(input: {
  route: PublicTournamentRoute;
  currentRound: RoundNumber;
  rounds: readonly PublicRouteRoundMatrixEntry[];
}): PublicRouteState {
  const current = getMatrixEntry(input.rounds, input.currentRound);

  if (
    input.route === "/results" &&
    !RESULTS_ROUTE_PINNED_TO_CURRENT_STATUSES.has(current.status)
  ) {
    const previousFinal = latestPreviousFinalResultRound(input.rounds, input.currentRound);

    if (previousFinal) {
      return {
        route: input.route,
        roundNumber: previousFinal.roundNumber,
        source: "previous_round_result",
        status: previousFinal.status,
        showPreviousRoundResult: true,
      };
    }
  }

  return {
    route: input.route,
    roundNumber: current.roundNumber,
    source: "current_round",
    status: current.status,
    showPreviousRoundResult: false,
  };
}

export class RoundStateStore {
  private currentRound: RoundNumber = 1;
  private rehearsalMode = false;

  getSnapshot(): RoundStateSnapshot {
    return {
      currentRound: this.currentRound,
      rehearsalMode: this.rehearsalMode,
    };
  }

  setCurrentRound(roundNumber: RoundNumber, guard?: RoundChangeGuard) {
    if (guard) {
      assertCanChangeCurrentRound({
        currentRound: this.currentRound,
        targetRound: roundNumber,
        currentRoundStatus: guard.currentRoundStatus,
      });
    }

    this.currentRound = roundNumber;

    return this.getSnapshot();
  }

  advanceRound(guard?: RoundChangeGuard) {
    if (this.currentRound >= 4) {
      throw new Error("Round 4 is the final round.");
    }

    if (guard) {
      assertCanChangeCurrentRound({
        currentRound: this.currentRound,
        targetRound: (this.currentRound + 1) as RoundNumber,
        currentRoundStatus: guard.currentRoundStatus,
      });
    }

    this.currentRound = (this.currentRound + 1) as RoundNumber;

    return this.getSnapshot();
  }

  setRehearsalMode(enabled: boolean) {
    this.rehearsalMode = enabled;

    return this.getSnapshot();
  }

  exportSnapshot(): RoundStateSnapshot {
    return this.getSnapshot();
  }

  importSnapshot(snapshot: RoundStateSnapshot) {
    this.currentRound = snapshot.currentRound;
    this.rehearsalMode = snapshot.rehearsalMode;
  }
}
