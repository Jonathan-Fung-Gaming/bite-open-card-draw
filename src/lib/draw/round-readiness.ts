import type { DrawRecord } from "@/lib/draw/draw-state";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";

export type RoundDrawReadinessProblem = {
  setOrder: 1 | 2;
  displayLabel: RoundSetDefinition["displayLabel"];
  expectedChartCount: number;
  actualChartCount: number;
  reason: "missing" | "duplicate" | "wrong_chart_count";
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
): RoundDrawReadiness {
  const definitions = definitionsForRound(roundNumber);
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
) {
  const readiness = evaluateRoundDrawReadiness(roundNumber, draws);

  if (readiness.isReady) {
    return;
  }

  throw new Error("Both chart sets must be drawn with exactly 7 charts before continuing.");
}
