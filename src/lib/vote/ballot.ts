import type { DrawRecord } from "@/lib/draw/draw-state";

export type BallotSetChoice = {
  drawId: string;
  roundSetId: string;
  displayLabel: string;
  noBans: boolean;
  bannedChartIds: string[];
};

export type RoundBallot = {
  id: string;
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  playerStartggUsername: string;
  choices: BallotSetChoice[];
  submittedAt: string;
  revision: number;
  source: "player" | "manual_admin";
  manualReason: string | null;
  manualOverride: boolean;
  replacedExistingBallot: boolean;
};

export type PhoneRoundStatus =
  | {
      phase: "voting_open";
    }
  | {
      phase: "closed_revealing";
    }
  | {
      phase: "revealed";
      selectedCharts: Array<{
        id: string;
        name: string;
        artist: string;
        displayDifficulty: string;
        localImagePath?: string | null;
      }>;
    };

export type SubmitRoundBallotInput = {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  playerStartggUsername: string;
  choices: BallotSetChoice[];
};

export type SubmitRoundBallotOptions = {
  source?: RoundBallot["source"];
  manualReason?: string;
  manualOverride?: boolean;
  replacedExistingBallot?: boolean;
};

export function isSetChoiceComplete(choice: BallotSetChoice) {
  return choice.noBans
    ? choice.bannedChartIds.length === 0
    : choice.bannedChartIds.length >= 1 && choice.bannedChartIds.length <= 2;
}

export function validateRoundBallot(input: SubmitRoundBallotInput, draws: readonly DrawRecord[]) {
  if (draws.length !== 2) {
    throw new Error("Both chart sets must be drawn before voting.");
  }

  const drawIds = new Set(draws.map((draw) => draw.id));
  const choiceDrawIds = new Set(input.choices.map((choice) => choice.drawId));

  if (input.choices.length !== 2 || !input.choices.every(isSetChoiceComplete)) {
    throw new Error("Both chart sets must be completed before submitting.");
  }

  if (
    choiceDrawIds.size !== drawIds.size ||
    [...choiceDrawIds].some((choiceDrawId) => !drawIds.has(choiceDrawId))
  ) {
    throw new Error("Ballot must include exactly one completed choice for each active draw.");
  }

  for (const choice of input.choices) {
    const draw = draws.find((candidate) => candidate.id === choice.drawId);

    if (!draw) {
      throw new Error("Ballot choice references an unknown draw.");
    }

    if (choice.roundSetId !== draw.roundSetId) {
      throw new Error("Ballot choice static round set does not match its active draw.");
    }

    if (new Set(choice.bannedChartIds).size !== choice.bannedChartIds.length) {
      throw new Error("Duplicate chart bans are not allowed.");
    }

    const drawnChartIds = new Set(draw.charts.map((chart) => chart.id));

    if (choice.bannedChartIds.some((chartId) => !drawnChartIds.has(chartId))) {
      throw new Error("Ballot choice references a chart outside the drawn set.");
    }
  }
}

export function countBanSelections(ballots: readonly RoundBallot[]) {
  return ballots.reduce(
    (total, ballot) =>
      total +
      ballot.choices.reduce((choiceTotal, choice) => choiceTotal + choice.bannedChartIds.length, 0),
    0,
  );
}
