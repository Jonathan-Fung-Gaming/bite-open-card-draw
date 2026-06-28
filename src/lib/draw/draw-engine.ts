import { randomInt } from "node:crypto";
import type { NormalizedChart } from "@/lib/charts/types";
import { ROUND_SET_DEFINITIONS, type RoundSetDefinition } from "@/lib/tournament";

export type DrawnChartSummary = Pick<
  NormalizedChart,
  | "id"
  | "name"
  | "artist"
  | "displayDifficulty"
  | "songKey"
  | "chartKey"
  | "sourceBgImg"
  | "localImagePath"
>;

export type DrawEligibilityInput = {
  charts: readonly NormalizedChart[];
  set: RoundSetDefinition;
  excludedChartKeys?: ReadonlySet<string>;
  selectedSongKeys?: ReadonlySet<string>;
  sameRoundBlockedSongKeys?: ReadonlySet<string>;
};

export type RandomIndex = (exclusiveMax: number) => number;

export function getRoundSetDefinition(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2) {
  const set = ROUND_SET_DEFINITIONS.find(
    (definition) => definition.roundNumber === roundNumber && definition.setOrder === setOrder,
  );

  if (!set) {
    throw new Error(`Unknown round set: Round ${roundNumber}, Set ${setOrder}`);
  }

  return set;
}

export function getEligibleChartsForSet(input: DrawEligibilityInput) {
  const chartType = input.set.chartType.toLowerCase();
  const excludedChartKeys = input.excludedChartKeys ?? new Set<string>();
  const selectedSongKeys = input.selectedSongKeys ?? new Set<string>();
  const sameRoundBlockedSongKeys = input.sameRoundBlockedSongKeys ?? new Set<string>();
  const seenSongKeys = new Set<string>();
  const eligible: NormalizedChart[] = [];

  for (const chart of input.charts) {
    if (
      !chart.tournamentScope ||
      chart.excluded ||
      chart.chartType !== chartType ||
      chart.level !== input.set.chartLevel ||
      excludedChartKeys.has(chart.chartKey) ||
      selectedSongKeys.has(chart.songKey) ||
      sameRoundBlockedSongKeys.has(chart.songKey) ||
      seenSongKeys.has(chart.songKey)
    ) {
      continue;
    }

    seenSongKeys.add(chart.songKey);
    eligible.push(chart);
  }

  return eligible;
}

export function secureRandomIndex(exclusiveMax: number) {
  return randomInt(exclusiveMax);
}

export function drawChartsForSet(
  input: DrawEligibilityInput,
  randomIndex: RandomIndex = secureRandomIndex,
): {
  eligiblePoolCount: number;
  charts: DrawnChartSummary[];
} {
  const eligible = getEligibleChartsForSet(input);

  if (eligible.length < input.set.drawCount) {
    throw new Error(
      `${input.set.displayLabel} has ${eligible.length} eligible charts; ${input.set.drawCount} required.`,
    );
  }

  const pool = [...eligible];
  const drawn: NormalizedChart[] = [];

  while (drawn.length < input.set.drawCount) {
    const index = randomIndex(pool.length);
    const [chart] = pool.splice(index, 1);

    if (chart) {
      drawn.push(chart);
    }
  }

  return {
    eligiblePoolCount: eligible.length,
    charts: drawn.map(toDrawnChartSummary),
  };
}

export function toDrawnChartSummary(chart: NormalizedChart): DrawnChartSummary {
  return {
    id: chart.id,
    name: chart.name,
    artist: chart.artist,
    displayDifficulty: chart.displayDifficulty,
    songKey: chart.songKey,
    chartKey: chart.chartKey,
    sourceBgImg: chart.sourceBgImg,
    localImagePath: chart.localImagePath,
  };
}
