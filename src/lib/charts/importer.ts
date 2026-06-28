import { parse } from "csv-parse/sync";
import { applyChartExclusions, getEligibleTournamentCharts } from "./exclusions";
import { normalizeChartRow } from "./normalize";
import {
  EXPECTED_CHART_CSV_COLUMNS,
  REQUIRED_CHART_POOLS,
  type ChartDuplicate,
  type ChartExclusion,
  type ChartImportReport,
  type NormalizedChart,
  type RawChartCsvRow,
  type RequiredChartPool,
} from "./types";

export function parseChartCsv(csvText: string): RawChartCsvRow[] {
  const records = parse(csvText, {
    bom: true,
    columns: false,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  const [header, ...rows] = records;
  validateChartCsvHeader(header ?? []);

  return rows.map((row, index) => repairRawChartRecord(row, index + 2));
}

export function validateChartCsvHeader(header: readonly string[]) {
  const missing = EXPECTED_CHART_CSV_COLUMNS.filter((column, index) => header[index] !== column);

  if (missing.length > 0) {
    throw new Error(`Chart CSV missing required columns: ${missing.join(", ")}`);
  }
}

function joinCsvParts(parts: readonly string[]) {
  return parts.join(", ").trim();
}

function repairRawChartRecord(record: readonly string[], sourceRowNumber: number): RawChartCsvRow {
  if (record.length < EXPECTED_CHART_CSV_COLUMNS.length) {
    throw new Error(`Chart CSV row ${sourceRowNumber} has too few columns.`);
  }

  const [label, type, level, bgImg] = record.slice(-4);
  const leading = record.slice(0, -4);
  let best:
    | {
        score: number;
        row: RawChartCsvRow;
      }
    | null = null;

  for (let nameEnd = 1; nameEnd <= leading.length - 2; nameEnd += 1) {
    for (let nameKrEnd = nameEnd + 1; nameKrEnd <= leading.length - 1; nameKrEnd += 1) {
      const name = joinCsvParts(leading.slice(0, nameEnd));
      const nameKr = joinCsvParts(leading.slice(nameEnd, nameKrEnd));
      const artist = joinCsvParts(leading.slice(nameKrEnd));

      if (!name || !nameKr || !artist) {
        continue;
      }

      const matchingNameScore = name === nameKr ? 100 : 0;
      const balancedNameScore = -Math.abs(nameEnd - (nameKrEnd - nameEnd));
      const simpleArtistScore = -(leading.length - nameKrEnd);
      const score = matchingNameScore + balancedNameScore + simpleArtistScore;

      if (!best || score > best.score) {
        best = {
          score,
          row: {
            name,
            name_kr: nameKr,
            artist,
            label: label ?? "",
            type: type ?? "",
            level: level ?? "",
            bg_img: bgImg ?? "",
          },
        };
      }
    }
  }

  if (!best) {
    throw new Error(`Chart CSV row ${sourceRowNumber} could not be repaired.`);
  }

  return best.row;
}

export function createFallbackChartRows(): RawChartCsvRow[] {
  return REQUIRED_CHART_POOLS.flatMap((pool) => {
    const chartType = pool.slice(0, 1).toLowerCase();
    const level = pool.slice(1);

    return Array.from({ length: 7 }, (_, index) => ({
      name: `Fixture ${pool} ${index + 1}`,
      name_kr: `Fixture ${pool} ${index + 1}`,
      artist: "Open Stage Fixture",
      label: "fixture",
      type: chartType,
      level,
      bg_img: "",
    }));
  });
}

export function buildPoolCounts(charts: readonly NormalizedChart[]) {
  const counts = Object.fromEntries(REQUIRED_CHART_POOLS.map((pool) => [pool, 0])) as Record<
    RequiredChartPool,
    number
  >;

  for (const chart of getEligibleTournamentCharts(charts)) {
    if (REQUIRED_CHART_POOLS.includes(chart.displayDifficulty as RequiredChartPool)) {
      counts[chart.displayDifficulty as RequiredChartPool] += 1;
    }
  }

  return counts;
}

export function importChartRows(
  rows: readonly RawChartCsvRow[],
  options: {
    sourcePath: string;
    usedFixture?: boolean;
    exclusions?: readonly ChartExclusion[];
    generatedAt?: string;
  },
): {
  charts: NormalizedChart[];
  report: ChartImportReport;
} {
  const chartsByKey = new Map<string, NormalizedChart>();
  const duplicateChartKeys: ChartDuplicate[] = [];
  const skippedRows: ChartImportReport["skippedRows"] = [];

  rows.forEach((row, index) => {
    const sourceRowNumber = index + 2;

    try {
      const chart = normalizeChartRow(row, sourceRowNumber);
      const existing = chartsByKey.get(chart.chartKey);

      if (existing) {
        duplicateChartKeys.push({
          chartKey: chart.chartKey,
          firstSourceRowNumber: existing.sourceRowNumber,
          duplicateSourceRowNumber: sourceRowNumber,
        });
        return;
      }

      chartsByKey.set(chart.chartKey, chart);
    } catch (error) {
      skippedRows.push({
        sourceRowNumber,
        reason: error instanceof Error ? error.message : "Unknown import error",
      });
    }
  });

  const charts = applyChartExclusions([...chartsByKey.values()], options.exclusions ?? []);
  const poolCounts = buildPoolCounts(charts);
  const poolsWithTooFewCharts = REQUIRED_CHART_POOLS.filter((pool) => poolCounts[pool] < 7);

  return {
    charts,
    report: {
      sourcePath: options.sourcePath,
      usedFixture: options.usedFixture ?? false,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      totalSourceRows: rows.length,
      importedCharts: charts.length,
      skippedRows,
      duplicateChartKeys,
      poolCounts,
      poolsWithTooFewCharts,
    },
  };
}
