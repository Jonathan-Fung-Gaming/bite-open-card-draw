import type { ChartExclusion, NormalizedChart } from "./types";

function exclusionTime(exclusion: ChartExclusion) {
  const parsed = Date.parse(exclusion.updatedAt);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeChartExclusionState(
  exclusions: readonly ChartExclusion[],
): ChartExclusion[] {
  const latestByChartKey = new Map<string, ChartExclusion>();

  for (const exclusion of exclusions) {
    const existing = latestByChartKey.get(exclusion.chartKey);

    if (!existing || exclusionTime(exclusion) >= exclusionTime(existing)) {
      latestByChartKey.set(exclusion.chartKey, {
        ...exclusion,
        reason: exclusion.reason.trim(),
      });
    }
  }

  return [...latestByChartKey.values()].sort((left, right) =>
    left.chartKey.localeCompare(right.chartKey),
  );
}

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

  const next = normalizeChartExclusionState(exclusions).filter(
    (exclusion) => exclusion.chartKey !== chartKey,
  );

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
    normalizeChartExclusionState(exclusions)
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

export function overlayChartExclusionOverrides(
  charts: readonly NormalizedChart[],
  exclusions: readonly ChartExclusion[],
): NormalizedChart[] {
  const overrides = new Map(
    normalizeChartExclusionState(exclusions).map((exclusion) => [
      exclusion.chartKey,
      exclusion,
    ]),
  );

  return charts.map((chart) => {
    const override = overrides.get(chart.chartKey);

    if (!override) {
      return chart;
    }

    return {
      ...chart,
      excluded: override.excluded,
      exclusionReason: override.excluded ? override.reason : null,
    };
  });
}

export function getEligibleTournamentCharts(charts: readonly NormalizedChart[]) {
  return charts.filter((chart) => chart.tournamentScope && !chart.excluded);
}
