import type { DrawnChartSummary, RandomIndex } from "@/lib/draw/draw-engine";
import { secureRandomIndex } from "@/lib/draw/draw-engine";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { assertRoundDrawsReady } from "@/lib/draw/round-readiness";
import type { PriorSelectedSongBlock } from "@/lib/results/selected-song-blocks";
import type { EligiblePlayerSnapshot } from "@/lib/vote/voting-window";
import type { RoundBallot } from "@/lib/vote/ballot";
import type { ResultRevealPhase } from "./reveal-phase-order";

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
  zeroBallotTiebreak?: boolean;
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

export { RESULT_REVEAL_PHASES, type ResultRevealPhase } from "./reveal-phase-order";

function sortResultRows(left: ResultChartRow, right: ResultChartRow) {
  if (left.banCount !== right.banCount) {
    return left.banCount - right.banCount;
  }

  return left.chart.name.localeCompare(right.chart.name);
}

export function filterBallotsByEligiblePlayers(
  ballots: readonly RoundBallot[],
  eligiblePlayers: readonly EligiblePlayerSnapshot[],
) {
  const eligiblePlayerIds = new Set(eligiblePlayers.map((player) => player.id));

  return ballots.filter((ballot) => eligiblePlayerIds.has(ballot.playerId));
}

export function buildWheelSlots(candidates: DrawnChartSummary[]) {
  if (candidates.length < 2 || candidates.length > 4) {
    return [];
  }

  return Array.from(
    { length: 12 },
    (_, index) => candidates[index % candidates.length] as DrawnChartSummary,
  );
}

export function computeResultSet(
  draw: DrawRecord,
  ballots: readonly RoundBallot[],
  randomIndex: RandomIndex = secureRandomIndex,
): ResultSetSnapshot {
  const banCounts = new Map(draw.charts.map((chart) => [chart.id, 0]));

  for (const ballot of ballots) {
    const choice = ballot.choices.find((candidate) => candidate?.drawId === draw.id);

    for (const chartId of choice?.bannedChartIds ?? []) {
      if (banCounts.has(chartId)) {
        banCounts.set(chartId, (banCounts.get(chartId) ?? 0) + 1);
      }
    }
  }

  const ballotCountForSet = ballots.filter((ballot) =>
    ballot.choices.some((choice) => choice?.drawId === draw.id),
  ).length;
  const leastBanCount = Math.min(...banCounts.values());
  const maxBanCount = Math.max(...banCounts.values());
  const leastBannedCharts = draw.charts
    .filter((chart) => banCounts.get(chart.id) === leastBanCount)
    .sort((left, right) => left.name.localeCompare(right.name));
  const tiebreakUsed = leastBannedCharts.length > 1;
  const zeroBallotTiebreak =
    ballotCountForSet === 0 && leastBannedCharts.length === draw.charts.length;
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
    wheelSupported: wheelSlots.length > 0,
    zeroBallotTiebreak,
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
  priorSelectedSongBlocks: readonly PriorSelectedSongBlock[];
  randomIndex?: RandomIndex;
}): RoundResultSnapshot {
  const draws = [...input.draws].sort((left, right) => left.setOrder - right.setOrder);
  const countedBallots = filterBallotsByEligiblePlayers(input.ballots, input.eligiblePlayers);

  assertRoundDrawsReady(input.roundNumber, draws, {
    priorSelectedSongBlocks: input.priorSelectedSongBlocks,
  });

  return {
    id: input.id,
    roundNumber: input.roundNumber,
    computedAt: input.computedAt,
    eligiblePlayers: [...input.eligiblePlayers],
    sets: [
      computeResultSet(draws[0] as DrawRecord, countedBallots, input.randomIndex),
      computeResultSet(draws[1] as DrawRecord, countedBallots, input.randomIndex),
    ],
    revealPhase: "computed",
    revealPhaseStartedAt: input.computedAt,
    finalRevealedAt: null,
  };
}
