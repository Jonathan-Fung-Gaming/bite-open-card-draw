import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { applyChartExclusions, getEligibleTournamentCharts } from "./exclusions";
import { normalizeChartRow } from "./normalize";
import {
  EXPECTED_CHART_CSV_COLUMNS,
  REQUIRED_CHART_POOLS,
  type ChartDuplicate,
  type ChartExclusion,
  type ChartImportRowDiagnostic,
  type ChartImportReport,
  type NormalizedChart,
  type RawChartCsvRow,
  type RequiredChartPool,
} from "./types";

export type ParsedChartCsv = {
  rows: RawChartCsvRow[];
  repairedRows: ChartImportRowDiagnostic[];
  sourceSha256: string;
};

export function hashChartCsvText(csvText: string) {
  return createHash("sha256").update(csvText).digest("hex");
}

export function parseChartCsv(csvText: string): RawChartCsvRow[] {
  return parseChartCsvWithReport(csvText).rows;
}

export function parseChartCsvWithReport(csvText: string): ParsedChartCsv {
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
  const repairedRows: ChartImportRowDiagnostic[] = [];

  return {
    rows: rows.map((row, index) => {
      const sourceRowNumber = index + 2;
      const repaired = repairRawChartRecord(row, sourceRowNumber);

      if (repaired.reason) {
        repairedRows.push({
          sourceRowNumber,
          reason: repaired.reason,
        });
      }

      return repaired.row;
    }),
    repairedRows,
    sourceSha256: hashChartCsvText(csvText),
  };
}

export function validateChartCsvHeader(header: readonly string[]) {
  if (header.length !== EXPECTED_CHART_CSV_COLUMNS.length) {
    throw new Error(
      `Chart CSV header must exactly match ${EXPECTED_CHART_CSV_COLUMNS.join(
        ", ",
      )}; found ${header.length} columns: ${header.join(", ")}`,
    );
  }

  const mismatches = EXPECTED_CHART_CSV_COLUMNS.flatMap((column, index) =>
    header[index] === column
      ? []
      : [`column ${index + 1} expected ${column} but found ${header[index] ?? "<missing>"}`],
  );

  if (mismatches.length > 0) {
    throw new Error(`Chart CSV header order mismatch: ${mismatches.join("; ")}`);
  }
}

function joinCsvParts(parts: readonly string[]) {
  return parts.join(", ").trim();
}

function looksLikeRepairableRowTail(
  label: string | undefined,
  type: string | undefined,
  level: string | undefined,
  bgImg: string | undefined,
) {
  const normalizedType = type?.trim().toLowerCase();

  return (
    Boolean(label?.trim()) &&
    (normalizedType === "s" ||
      normalizedType === "d" ||
      normalizedType === "single" ||
      normalizedType === "double") &&
    /^(?:0*[1-9]\d*)$/.test(level ?? "") &&
    /^https?:\/\//i.test(bgImg?.trim() ?? "")
  );
}

function repairRawChartRecord(
  record: readonly string[],
  sourceRowNumber: number,
): { row: RawChartCsvRow; reason: string | null } {
  if (record.length < EXPECTED_CHART_CSV_COLUMNS.length) {
    throw new Error(`Chart CSV row ${sourceRowNumber} has too few columns.`);
  }

  if (record.length === EXPECTED_CHART_CSV_COLUMNS.length) {
    return {
      row: {
        name: record[0] ?? "",
        name_kr: record[1] ?? "",
        artist: record[2] ?? "",
        label: record[3] ?? "",
        type: record[4] ?? "",
        level: record[5] ?? "",
        bg_img: record[6] ?? "",
      },
      reason: null,
    };
  }

  if (record.length !== 9) {
    throw new Error(
      `Chart CSV row ${sourceRowNumber} has unexpected extra columns after bg_img or an unrecognized repair shape.`,
    );
  }

  const [label, type, level, bgImg] = record.slice(-4);

  if (!looksLikeRepairableRowTail(label, type, level, bgImg)) {
    throw new Error(
      `Chart CSV row ${sourceRowNumber} has unexpected extra columns after bg_img or an unrecognized repair shape.`,
    );
  }

  const leading = record.slice(0, -4);
  let best: {
    score: number;
    row: RawChartCsvRow;
  } | null = null;

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

  if (best.row.name !== best.row.name_kr) {
    throw new Error(
      `Chart CSV row ${sourceRowNumber} has an unrecognized repair shape; only mirrored title repairs are supported.`,
    );
  }

  return {
    row: best.row,
    reason: `Row had ${record.length} columns; reconstructed the expected ${EXPECTED_CHART_CSV_COLUMNS.length} columns.`,
  };
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
    sourceSha256?: string | null;
    repairedRows?: readonly ChartImportRowDiagnostic[];
    strict?: boolean;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    reviewedCommit?: string | null;
  },
): {
  charts: NormalizedChart[];
  report: ChartImportReport;
} {
  const chartsByKey = new Map<string, NormalizedChart>();
  const duplicateChartKeys: ChartDuplicate[] = [];
  const skippedRows: ChartImportReport["skippedRows"] = [];
  const outOfScopeRows: ChartImportReport["outOfScopeRows"] = [];

  rows.forEach((row, index) => {
    const sourceRowNumber = index + 2;

    try {
      const chart = normalizeChartRow(row, sourceRowNumber);
      const existing = chartsByKey.get(chart.chartKey);

      if (!chart.tournamentScope) {
        outOfScopeRows.push({
          sourceRowNumber,
          reason: `${chart.displayDifficulty} is outside required tournament pools.`,
        });
      }

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
  const repairedRows = [...(options.repairedRows ?? [])];
  const strictFailures = options.strict
    ? [
        ...repairedRows.map(
          (row) => `Row ${row.sourceRowNumber} was repaired: ${row.reason}`,
        ),
        ...skippedRows.map((row) => `Row ${row.sourceRowNumber} was skipped: ${row.reason}`),
        ...duplicateChartKeys.map(
          (duplicate) =>
            `Duplicate chart key ${duplicate.chartKey} at rows ${duplicate.firstSourceRowNumber} and ${duplicate.duplicateSourceRowNumber}.`,
        ),
        ...poolsWithTooFewCharts.map(
          (pool) => `Required pool ${pool} has ${poolCounts[pool]} eligible charts.`,
        ),
      ]
    : [];

  return {
    charts,
    report: {
      sourcePath: options.sourcePath,
      usedFixture: options.usedFixture ?? false,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      sourceSha256: options.sourceSha256 ?? null,
      strictMode: options.strict ?? false,
      reviewedBy: options.reviewedBy ?? null,
      reviewedAt: options.reviewedAt ?? null,
      reviewedCommit: options.reviewedCommit ?? null,
      totalSourceRows: rows.length,
      importedCharts: charts.length,
      repairedRows,
      skippedRows,
      outOfScopeRows,
      duplicateChartKeys,
      poolCounts,
      poolsWithTooFewCharts,
      strictFailures,
    },
  };
}
