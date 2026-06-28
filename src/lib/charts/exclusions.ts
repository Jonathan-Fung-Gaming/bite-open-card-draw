import type { ChartExclusion, NormalizedChart } from "./types";

export function upsertChartExclusion(
  exclusions: readonly ChartExclusion[],
  chartKey: string,
  excluded: boolean,
  reason: string,
  updatedAt = new Date().toISOString(),
): ChartExclusion[] {
  if (!reason.trim()) {
    throw new Error("Chart exclusion reason is required.");
  }

  const next = exclusions.filter((exclusion) => exclusion.chartKey !== chartKey);

  next.push({
    chartKey,
    excluded,
    reason: reason.trim(),
    updatedAt,
  });

  return next.sort((left, right) => left.chartKey.localeCompare(right.chartKey));
}

export function applyChartExclusions(
  charts: readonly NormalizedChart[],
  exclusions: readonly ChartExclusion[],
): NormalizedChart[] {
  const activeExclusions = new Map(
    exclusions
      .filter((exclusion) => exclusion.excluded)
      .map((exclusion) => [exclusion.chartKey, exclusion.reason]),
  );

  return charts.map((chart) => {
    const reason = activeExclusions.get(chart.chartKey) ?? null;

    return {
      ...chart,
      excluded: reason !== null,
      exclusionReason: reason,
    };
  });
}

export function getEligibleTournamentCharts(charts: readonly NormalizedChart[]) {
  return charts.filter((chart) => chart.tournamentScope && !chart.excluded);
}
