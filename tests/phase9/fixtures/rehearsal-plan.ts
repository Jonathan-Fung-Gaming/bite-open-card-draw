export type RehearsalBanPlan = readonly [readonly number[], readonly number[]];

export type RehearsalBallotRevisionPlan = {
  banPlan: RehearsalBanPlan;
  revision: number;
};

export type RehearsalBallotPlan = {
  finalBanPlan: RehearsalBanPlan;
  playerName: string;
  revisions: readonly RehearsalBallotRevisionPlan[];
};

export type RehearsalRoundExpectation = {
  activePlayerCount: number;
  activePlayers: readonly string[];
  ballotPlans: readonly RehearsalBallotPlan[];
  expectedActiveAtRoundStartRows: number;
  expectedBanSelectionCount: number;
  expectedRevisionByPlayer: ReadonlyMap<string, number>;
  expectedRows: number;
  expectedSubmittedRows: number;
  playersToMarkInactiveBeforeRound: readonly string[];
  requiredCsvPlayers: readonly string[];
  roundNumber: number;
  submittedPlayerCount: number;
  submittedPlayers: readonly string[];
};

const NO_BANS: RehearsalBanPlan = [[], []];
const PRODUCTION_FLOW_ACTIVE_COUNTS = [48, 36, 24, 12] as const;
const SMOKE_ACTIVE_PLAYER_COUNT = 12;
const SMOKE_SUBMITTED_PLAYER_COUNT = 2;
const FULL_REHEARSAL_PLAYER_COUNT = 48;
const ATTRITION_BATCH_SIZE = 12;
const SUPPORTED_TIEBREAK_BAN_PAIRS = [
  [2, 3],
  [4, 5],
  [6, 2],
  [3, 4],
  [5, 6],
] as const;

export function rehearsalPlayerName(playerNumber: number) {
  return `Rehearsal Player ${String(playerNumber).padStart(2, "0")}`;
}

export function createRehearsalPlayers(count: number) {
  return Array.from({ length: count }, (_, index) => rehearsalPlayerName(index + 1));
}

function finalBanPlanForSubmittedIndex(submittedIndex: number): RehearsalBanPlan {
  const pair = SUPPORTED_TIEBREAK_BAN_PAIRS[
    submittedIndex % SUPPORTED_TIEBREAK_BAN_PAIRS.length
  ] ?? [2, 3];

  return [pair, pair];
}

function createBallotPlan(
  playerName: string,
  submittedIndex: number,
  banVoterCount: number,
): RehearsalBallotPlan {
  const finalBanPlan =
    submittedIndex < banVoterCount ? finalBanPlanForSubmittedIndex(submittedIndex) : NO_BANS;
  const revisions =
    submittedIndex === 0
      ? [
          { banPlan: NO_BANS, revision: 1 },
          { banPlan: finalBanPlan, revision: 2 },
        ]
      : [{ banPlan: finalBanPlan, revision: 1 }];

  return {
    finalBanPlan,
    playerName,
    revisions,
  };
}

function expectedRevisionByPlayer(ballotPlans: readonly RehearsalBallotPlan[]) {
  return new Map(
    ballotPlans.map((plan) => [
      plan.playerName,
      plan.revisions[plan.revisions.length - 1]?.revision ?? 1,
    ]),
  );
}

function countFinalBanSelections(ballotPlans: readonly RehearsalBallotPlan[]) {
  return ballotPlans.reduce(
    (total, plan) =>
      total + plan.finalBanPlan.reduce((setTotal, bannedIndexes) => setTotal + bannedIndexes.length, 0),
    0,
  );
}

function createRoundExpectation(input: {
  activePlayers: readonly string[];
  banVoterCount?: number;
  playersToMarkInactiveBeforeRound: readonly string[];
  roundNumber: number;
  submittedPlayers: readonly string[];
}): RehearsalRoundExpectation {
  const banVoterCount = input.banVoterCount ?? input.submittedPlayers.length;
  const ballotPlans = input.submittedPlayers.map((playerName, submittedIndex) =>
    createBallotPlan(playerName, submittedIndex, banVoterCount),
  );
  const revisionByPlayer = expectedRevisionByPlayer(ballotPlans);

  return {
    activePlayerCount: input.activePlayers.length,
    activePlayers: input.activePlayers,
    ballotPlans,
    expectedActiveAtRoundStartRows: input.activePlayers.length,
    expectedBanSelectionCount: countFinalBanSelections(ballotPlans),
    expectedRevisionByPlayer: revisionByPlayer,
    expectedRows: input.activePlayers.length,
    expectedSubmittedRows: input.submittedPlayers.length,
    playersToMarkInactiveBeforeRound: input.playersToMarkInactiveBeforeRound,
    requiredCsvPlayers: input.activePlayers,
    roundNumber: input.roundNumber,
    submittedPlayerCount: input.submittedPlayers.length,
    submittedPlayers: input.submittedPlayers,
  };
}

export function createSmokeRoundExpectation(roundNumber: number): RehearsalRoundExpectation {
  const activePlayers = createRehearsalPlayers(SMOKE_ACTIVE_PLAYER_COUNT);
  const submittedPlayers = activePlayers.slice(0, SMOKE_SUBMITTED_PLAYER_COUNT);

  return createRoundExpectation({
    activePlayers,
    playersToMarkInactiveBeforeRound: [],
    roundNumber,
    submittedPlayers,
  });
}

export function createSmokeRoundExpectations(rounds: readonly number[]) {
  return rounds.map((roundNumber) => createSmokeRoundExpectation(roundNumber));
}

export function createProductionFlowRoundExpectations(): RehearsalRoundExpectation[] {
  const allPlayers = createRehearsalPlayers(FULL_REHEARSAL_PLAYER_COUNT);

  return PRODUCTION_FLOW_ACTIVE_COUNTS.map((activeCount, index) => {
    const roundNumber = index + 1;
    const activePlayers = allPlayers.slice(0, activeCount);
    const previousActiveCount = PRODUCTION_FLOW_ACTIVE_COUNTS[index - 1];
    const playersToMarkInactiveBeforeRound =
      typeof previousActiveCount === "number"
        ? allPlayers.slice(activeCount, previousActiveCount)
        : [];

    return createRoundExpectation({
      activePlayers,
      banVoterCount: 3,
      playersToMarkInactiveBeforeRound,
      roundNumber,
      submittedPlayers: activePlayers,
    });
  });
}

export function expectedAllProductionFlowPlayers() {
  return createRehearsalPlayers(FULL_REHEARSAL_PLAYER_COUNT);
}

export function assertRoundAttritionPlan(expectations: readonly RehearsalRoundExpectation[]) {
  const activeCounts = expectations.map((expectation) => expectation.activePlayerCount);

  if (activeCounts.join(",") !== PRODUCTION_FLOW_ACTIVE_COUNTS.join(",")) {
    throw new Error(
      `Production-flow active counts must be ${PRODUCTION_FLOW_ACTIVE_COUNTS.join(" -> ")}, got ${activeCounts.join(" -> ")}.`,
    );
  }

  for (const expectation of expectations.slice(1)) {
    if (expectation.playersToMarkInactiveBeforeRound.length !== ATTRITION_BATCH_SIZE) {
      throw new Error(
        `Round ${expectation.roundNumber} should mark exactly ${ATTRITION_BATCH_SIZE} players inactive before voting opens.`,
      );
    }
  }
}
