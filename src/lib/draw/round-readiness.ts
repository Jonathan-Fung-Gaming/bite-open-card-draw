import type { DrawRecord } from "@/lib/draw/draw-state";
import {
  findPriorSelectedSongDrawConflicts,
  type PriorSelectedSongBlock,
} from "@/lib/results/selected-song-blocks";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";

export type RoundDrawReadinessProblem = {
  setOrder: 1 | 2;
  displayLabel: string;
  expectedChartCount: number;
  actualChartCount: number;
  reason: "missing" | "duplicate" | "wrong_chart_count" | "prior_selected_song";
  chartId?: string;
  chartName?: string;
  songKey?: string;
  selectedInRoundNumber?: 1 | 2 | 3 | 4;
};

export type RoundDrawReadiness = {
  isReady: boolean;
  completeSetCount: number;
  expectedSetCount: number;
  problems: RoundDrawReadinessProblem[];
};

function definitionsForRound(roundNumber: 1 | 2 | 3 | 4) {
  return ROUND_SET_DEFINITIONS.filter((definition) => definition.roundNumber === roundNumber);
}

export function evaluateRoundDrawReadiness(
  roundNumber: 1 | 2 | 3 | 4,
  draws: readonly DrawRecord[],
  options: { priorSelectedSongBlocks?: readonly PriorSelectedSongBlock[] } = {},
): RoundDrawReadiness {
  const definitions = definitionsForRound(roundNumber);
  const definitionsBySetOrder = new Map(definitions.map((definition) => [definition.setOrder, definition]));
  const problems: RoundDrawReadinessProblem[] = [];
  let completeSetCount = 0;

  for (const definition of definitions) {
    const candidates = draws.filter(
      (draw) => draw.roundNumber === roundNumber && draw.setOrder === definition.setOrder,
    );

    if (candidates.length === 0) {
      problems.push({
        setOrder: definition.setOrder,
        displayLabel: definition.displayLabel,
        expectedChartCount: definition.drawCount,
        actualChartCount: 0,
        reason: "missing",
      });
      continue;
    }

    if (candidates.length > 1) {
      problems.push({
        setOrder: definition.setOrder,
        displayLabel: definition.displayLabel,
        expectedChartCount: definition.drawCount,
        actualChartCount: candidates.reduce((total, draw) => total + draw.charts.length, 0),
        reason: "duplicate",
      });
      continue;
    }

    const [draw] = candidates;

    if (!draw || draw.charts.length !== definition.drawCount) {
      problems.push({
        setOrder: definition.setOrder,
        displayLabel: definition.displayLabel,
        expectedChartCount: definition.drawCount,
        actualChartCount: draw?.charts.length ?? 0,
        reason: "wrong_chart_count",
      });
      continue;
    }

    completeSetCount += 1;
  }

  for (const conflict of findPriorSelectedSongDrawConflicts({
    roundNumber,
    draws,
    priorSelectedSongBlocks: options.priorSelectedSongBlocks ?? [],
  })) {
    const definition = definitionsBySetOrder.get(conflict.setOrder);
    const draw = draws.find(
      (candidate) =>
        candidate.roundNumber === roundNumber &&
        candidate.setOrder === conflict.setOrder &&
        !candidate.supersededAt,
    );

    problems.push({
      setOrder: conflict.setOrder,
      displayLabel: definition?.displayLabel ?? conflict.displayLabel,
      expectedChartCount: definition?.drawCount ?? 7,
      actualChartCount: draw?.charts.length ?? 0,
      reason: "prior_selected_song",
      chartId: conflict.chartId,
      chartName: conflict.chartName,
      songKey: conflict.songKey,
      selectedInRoundNumber: conflict.selectedInRoundNumber,
    });
  }

  return {
    isReady: problems.length === 0 && completeSetCount === definitions.length,
    completeSetCount,
    expectedSetCount: definitions.length,
    problems,
  };
}

export function assertRoundDrawsReady(
  roundNumber: 1 | 2 | 3 | 4,
  draws: readonly DrawRecord[],
  options: { priorSelectedSongBlocks?: readonly PriorSelectedSongBlock[] } = {},
) {
  const readiness = evaluateRoundDrawReadiness(roundNumber, draws, options);

  if (readiness.isReady) {
    return;
  }

  const selectedSongProblem = readiness.problems.find(
    (problem) => problem.reason === "prior_selected_song",
  );

  if (selectedSongProblem) {
    throw new Error(
      `Round ${roundNumber} ${selectedSongProblem.displayLabel} includes ${selectedSongProblem.chartName}, which was selected in Round ${selectedSongProblem.selectedInRoundNumber}. Reroll or reset the affected future draw before opening voting or computing results.`,
    );
  }

  throw new Error("Both chart sets must be drawn with exactly 7 charts before continuing.");
}
