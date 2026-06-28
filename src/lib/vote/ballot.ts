import type { DrawRecord } from "@/lib/draw/draw-state";

export type BallotSetChoice = {
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
      }>;
    };

export type SubmitRoundBallotInput = {
  roundNumber: 1 | 2 | 3 | 4;
  playerId: string;
  playerStartggUsername: string;
  choices: BallotSetChoice[];
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

  if (input.choices.length !== 2 || !input.choices.every(isSetChoiceComplete)) {
    throw new Error("Both chart sets must be completed before submitting.");
  }

  for (const choice of input.choices) {
    const draw = draws.find((candidate) => candidate.id === choice.roundSetId);

    if (!draw) {
      throw new Error("Ballot choice references an unknown chart set.");
    }

    const drawnChartIds = new Set(draw.charts.map((chart) => chart.id));

    if (choice.bannedChartIds.some((chartId) => !drawnChartIds.has(chartId))) {
      throw new Error("Ballot choice references a chart outside the drawn set.");
    }
  }
}
