import type { DrawnChartSummary, RandomIndex } from "@/lib/draw/draw-engine";
import { secureRandomIndex } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import type { RoundBallot } from "@/lib/vote/ballot";

export type ResultChartRow = {
  chart: DrawnChartSummary;
  banCount: number;
  selected: boolean;
  tiedForFewest: boolean;
};

export type ResultSetSnapshot = {
  drawId: string;
  drawVersion: number;
  roundSetId: string;
  setOrder: 1 | 2;
  displayLabel: string;
  rows: ResultChartRow[];
  maxBanCount: number;
  leastBanCount: number;
  selectedChart: DrawnChartSummary;
  tiebreakUsed: boolean;
  tiebreakCandidateIds: string[];
  tiebreakWinnerChartId: string | null;
  wheelSlots: DrawnChartSummary[];
  wheelSupported: boolean;
  winnerRevealStartedAt: string | null;
};

export type RoundResultSnapshot = {
  id: string;
  roundNumber: 1 | 2 | 3 | 4;
  computedAt: string;
  eligiblePlayers: EligiblePlayerSnapshot[];
  sets: [ResultSetSnapshot, ResultSetSnapshot];
  revealPhase: ResultRevealPhase;
  revealPhaseStartedAt: string;
  finalRevealedAt: string | null;
};

export type ResultRevealPhase =
  | "computed"
  | "set_1_counts"
  | "set_1_resolved"
  | "set_2_counts"
  | "set_2_resolved"
  | "final";

export const RESULT_REVEAL_PHASES: ResultRevealPhase[] = [
  "computed",
  "set_1_counts",
  "set_1_resolved",
  "set_2_counts",
  "set_2_resolved",
  "final",
];

function sortResultRows(left: ResultChartRow, right: ResultChartRow) {
  if (left.banCount !== right.banCount) {
    return left.banCount - right.banCount;
  }

  return left.chart.name.localeCompare(right.chart.name);
}

function buildWheelSlots(candidates: DrawnChartSummary[]) {
  if (candidates.length < 2 || candidates.length > 4) {
    return [];
  }

  return Array.from({ length: 12 }, (_, index) => candidates[index % candidates.length] as DrawnChartSummary);
}

export function computeResultSet(
  draw: DrawRecord,
  ballots: readonly RoundBallot[],
  randomIndex: RandomIndex = secureRandomIndex,
): ResultSetSnapshot {
  const banCounts = new Map(draw.charts.map((chart) => [chart.id, 0]));

  for (const ballot of ballots) {
    const choice = ballot.choices.find((candidate) => candidate.drawId === draw.id);

    for (const chartId of choice?.bannedChartIds ?? []) {
      if (banCounts.has(chartId)) {
        banCounts.set(chartId, (banCounts.get(chartId) ?? 0) + 1);
      }
    }
  }

  const leastBanCount = Math.min(...banCounts.values());
  const maxBanCount = Math.max(...banCounts.values());
  const leastBannedCharts = draw.charts
    .filter((chart) => banCounts.get(chart.id) === leastBanCount)
    .sort((left, right) => left.name.localeCompare(right.name));
  const tiebreakUsed = leastBannedCharts.length > 1;
  const selectedChart = tiebreakUsed
    ? (leastBannedCharts[randomIndex(leastBannedCharts.length)] as DrawnChartSummary)
    : (leastBannedCharts[0] as DrawnChartSummary);
  const wheelSlots = buildWheelSlots(leastBannedCharts);

  return {
    drawId: draw.id,
    drawVersion: draw.version,
    roundSetId: draw.roundSetId,
    setOrder: draw.setOrder,
    displayLabel: draw.displayLabel,
    rows: draw.charts
      .map((chart) => ({
        chart,
        banCount: banCounts.get(chart.id) ?? 0,
        selected: chart.id === selectedChart.id,
        tiedForFewest: (banCounts.get(chart.id) ?? 0) === leastBanCount,
      }))
      .sort(sortResultRows),
    maxBanCount,
    leastBanCount,
    selectedChart,
    tiebreakUsed,
    tiebreakCandidateIds: leastBannedCharts.map((chart) => chart.id),
    tiebreakWinnerChartId: tiebreakUsed ? selectedChart.id : null,
    wheelSlots,
    wheelSupported: wheelSlots.length === 12,
    winnerRevealStartedAt: null,
  };
}

export function computeRoundResult(input: {
  id: string;
  roundNumber: 1 | 2 | 3 | 4;
  draws: readonly DrawRecord[];
  ballots: readonly RoundBallot[];
  eligiblePlayers: EligiblePlayerSnapshot[];
  computedAt: string;
  randomIndex?: RandomIndex;
}): RoundResultSnapshot {
  const draws = [...input.draws].sort((left, right) => left.setOrder - right.setOrder);

  if (draws.length !== 2) {
    throw new Error("Both chart sets must be drawn before results can be computed.");
  }

  return {
    id: input.id,
    roundNumber: input.roundNumber,
    computedAt: input.computedAt,
    eligiblePlayers: [...input.eligiblePlayers],
    sets: [
      computeResultSet(draws[0] as DrawRecord, input.ballots, input.randomIndex),
      computeResultSet(draws[1] as DrawRecord, input.ballots, input.randomIndex),
    ],
    revealPhase: "computed",
    revealPhaseStartedAt: input.computedAt,
    finalRevealedAt: null,
  };
}
