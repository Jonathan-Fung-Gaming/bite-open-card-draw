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
  supportedTiebreakCandidateCounts: readonly number[];
};

const CHART_COUNT_PER_SET = 7;
const NO_BANS: RehearsalBanPlan = [[], []];
const PRODUCTION_FLOW_ACTIVE_COUNTS = [48, 36, 24, 12] as const;
const PRODUCTION_FLOW_MAX_RANDOM_SEED_ATTEMPTS = 250;
const PRODUCTION_FLOW_SUBMISSION_RATE = 0.8;
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

function seedNumber(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = seedNumber(seed);

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

function randomInteger(random: () => number, exclusiveMax: number) {
  return Math.floor(random() * exclusiveMax);
}

function shuffleSeeded<TValue>(values: readonly TValue[], seed: string) {
  const random = createSeededRandom(seed);
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, index + 1);
    const value = shuffled[index];

    shuffled[index] = shuffled[swapIndex] as TValue;
    shuffled[swapIndex] = value as TValue;
  }

  return shuffled;
}

function shuffleWithRandom<TValue>(values: readonly TValue[], random: () => number) {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, index + 1);
    const value = shuffled[index];

    shuffled[index] = shuffled[swapIndex] as TValue;
    shuffled[swapIndex] = value as TValue;
  }

  return shuffled;
}

function randomSetBanPlan(random: () => number) {
  const banCount = randomInteger(random, 3);

  return shuffleWithRandom([0, 1, 2, 3, 4, 5, 6], random)
    .slice(0, banCount)
    .sort((left, right) => left - right);
}

function randomBanPlan(seed: string): RehearsalBanPlan {
  const random = createSeededRandom(seed);

  return [randomSetBanPlan(random), randomSetBanPlan(random)];
}

function banSelectionCount(banPlan: RehearsalBanPlan) {
  return banPlan.reduce((total, bannedIndexes) => total + bannedIndexes.length, 0);
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

function createRandomBallotPlan(
  playerName: string,
  submittedIndex: number,
  roundNumber: number,
  seedNamespace: string,
): RehearsalBallotPlan {
  const seed = `${seedNamespace}:${roundNumber}:${playerName}:${submittedIndex}`;
  const fallbackRandom = createSeededRandom(`${seed}:fallback`);
  let finalBanPlan = randomBanPlan(seed);

  if (submittedIndex === 0 && banSelectionCount(finalBanPlan) === 0) {
    finalBanPlan = [[randomInteger(fallbackRandom, 7)], []];
  }

  return {
    finalBanPlan,
    playerName,
    revisions:
      submittedIndex === 0
        ? [
            { banPlan: NO_BANS, revision: 1 },
            { banPlan: finalBanPlan, revision: 2 },
          ]
        : [{ banPlan: finalBanPlan, revision: 1 }],
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

function supportedTiebreakCandidateCounts(ballotPlans: readonly RehearsalBallotPlan[]) {
  return [0, 1].map((setIndex) => {
    const banCounts = Array.from({ length: CHART_COUNT_PER_SET }, () => 0);

    for (const plan of ballotPlans) {
      for (const chartIndex of plan.finalBanPlan[setIndex] ?? []) {
        banCounts[chartIndex] = (banCounts[chartIndex] ?? 0) + 1;
      }
    }

    const leastBanCount = Math.min(...banCounts);

    return banCounts.filter((banCount) => banCount === leastBanCount).length;
  });
}

function isSupportedTiebreakCandidateCount(candidateCount: number) {
  return candidateCount >= 2 && candidateCount <= 4;
}

function hasSupportedTiebreak(ballotPlans: readonly RehearsalBallotPlan[]) {
  return supportedTiebreakCandidateCounts(ballotPlans).some(isSupportedTiebreakCandidateCount);
}

function createRoundExpectation(input: {
  activePlayers: readonly string[];
  banVoterCount?: number;
  createBallotPlanForPlayer?: (
    playerName: string,
    submittedIndex: number,
    roundNumber: number,
    seedNamespace: string,
  ) => RehearsalBallotPlan;
  randomSeedNamespace?: string;
  playersToMarkInactiveBeforeRound: readonly string[];
  roundNumber: number;
  submittedPlayers: readonly string[];
}): RehearsalRoundExpectation {
  const banVoterCount = input.banVoterCount ?? input.submittedPlayers.length;
  const randomSeedNamespace = input.randomSeedNamespace ?? "production-flow";
  const ballotPlans = input.submittedPlayers.map((playerName, submittedIndex) =>
    input.createBallotPlanForPlayer
      ? input.createBallotPlanForPlayer(
          playerName,
          submittedIndex,
          input.roundNumber,
          randomSeedNamespace,
        )
      : createBallotPlan(playerName, submittedIndex, banVoterCount),
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
    supportedTiebreakCandidateCounts: supportedTiebreakCandidateCounts(ballotPlans),
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
    const submittedPlayerCount = Math.round(activePlayers.length * PRODUCTION_FLOW_SUBMISSION_RATE);
    const submittedPlayers = shuffleSeeded(
      activePlayers,
      `production-flow-voters:${roundNumber}`,
    ).slice(0, submittedPlayerCount);

    for (let attempt = 0; attempt < PRODUCTION_FLOW_MAX_RANDOM_SEED_ATTEMPTS; attempt += 1) {
      const expectation = createRoundExpectation({
        activePlayers,
        createBallotPlanForPlayer: createRandomBallotPlan,
        playersToMarkInactiveBeforeRound,
        randomSeedNamespace: `production-flow:${roundNumber}:attempt-${attempt}`,
        roundNumber,
        submittedPlayers,
      });

      if (hasSupportedTiebreak(expectation.ballotPlans)) {
        return expectation;
      }
    }

    throw new Error(`Could not create random round ${roundNumber} ballots with a supported tiebreak.`);
  });
}

export function expectedAllProductionFlowPlayers() {
  return createRehearsalPlayers(FULL_REHEARSAL_PLAYER_COUNT);
}

export function visualEvidencePlayerName(expectation: RehearsalRoundExpectation) {
  const submittedPlayers = new Set(expectation.ballotPlans.map((plan) => plan.playerName));
  const nonSubmittingActivePlayers = expectation.activePlayers.filter(
    (playerName) => !submittedPlayers.has(playerName),
  );
  const playerName =
    nonSubmittingActivePlayers[nonSubmittingActivePlayers.length - 1] ??
    expectation.activePlayers[expectation.activePlayers.length - 1];

  if (!playerName) {
    throw new Error("Phase 11 visual evidence requires at least one active player.");
  }

  return playerName;
}

export function assertRoundAttritionPlan(expectations: readonly RehearsalRoundExpectation[]) {
  const activeCounts = expectations.map((expectation) => expectation.activePlayerCount);

  if (activeCounts.join(",") !== PRODUCTION_FLOW_ACTIVE_COUNTS.join(",")) {
    throw new Error(
      `Production-flow active counts must be ${PRODUCTION_FLOW_ACTIVE_COUNTS.join(" -> ")}, got ${activeCounts.join(" -> ")}.`,
    );
  }

  const submittedCounts = expectations.map((expectation) => expectation.submittedPlayerCount);
  const expectedSubmittedCounts = PRODUCTION_FLOW_ACTIVE_COUNTS.map((count) =>
    Math.round(count * PRODUCTION_FLOW_SUBMISSION_RATE),
  );

  if (submittedCounts.join(",") !== expectedSubmittedCounts.join(",")) {
    throw new Error(
      `Production-flow submitted counts must be ${expectedSubmittedCounts.join(" -> ")}, got ${submittedCounts.join(" -> ")}.`,
    );
  }

  for (const expectation of expectations.slice(1)) {
    if (expectation.playersToMarkInactiveBeforeRound.length !== ATTRITION_BATCH_SIZE) {
      throw new Error(
        `Round ${expectation.roundNumber} should mark exactly ${ATTRITION_BATCH_SIZE} players inactive before voting opens.`,
      );
    }
  }

  for (const expectation of expectations) {
    if (!expectation.supportedTiebreakCandidateCounts.some(isSupportedTiebreakCandidateCount)) {
      throw new Error(
        `Round ${expectation.roundNumber} should exercise a supported 2-4 chart tiebreak.`,
      );
    }
  }
}
