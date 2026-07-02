import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createFallbackChartRows,
  importChartRows,
  parseChartCsvWithReport,
} from "../src/lib/charts/importer";
import type { ChartExclusion } from "../src/lib/charts/types";

function readArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isChartExclusion(value: unknown): value is ChartExclusion {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.chartKey === "string" &&
    typeof candidate.excluded === "boolean" &&
    typeof candidate.reason === "string" &&
    typeof candidate.updatedAt === "string"
  );
}

function readChartExclusions(filePath: string) {
  if (!existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;

  if (!Array.isArray(parsed) || !parsed.every(isChartExclusion)) {
    throw new Error(
      `${filePath} must be a JSON array of { chartKey, excluded, reason, updatedAt } records.`,
    );
  }

  return parsed;
}

const sourcePath = readArg("source", "data/source/charts.csv");
const outputDir = readArg("output-dir", "data/generated");
const reviewedBy = readArg("reviewed-by", "");
const absoluteSourcePath = path.resolve(process.cwd(), sourcePath);
const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
const usedFixture = !existsSync(absoluteSourcePath);
const exclusionsPath = path.join(absoluteOutputDir, "chart-exclusions.json");
const strict = hasFlag("strict");

const sourceText = usedFixture ? null : readFileSync(absoluteSourcePath, "utf8");
const parsed = sourceText
  ? parseChartCsvWithReport(sourceText)
  : {
      rows: createFallbackChartRows(),
      repairedRows: [],
      sourceSha256: null,
    };

mkdirSync(absoluteOutputDir, { recursive: true });

const exclusions = readChartExclusions(exclusionsPath);
const { charts, report } = importChartRows(parsed.rows, {
  sourcePath,
  usedFixture,
  exclusions,
  strict,
  sourceSha256: parsed.sourceSha256,
  repairedRows: parsed.repairedRows,
  reviewedBy: reviewedBy || null,
  reviewedAt: reviewedBy ? new Date().toISOString() : null,
});

writeJson(path.join(absoluteOutputDir, "charts.json"), charts);
const reportJson = `${JSON.stringify(report, null, 2)}\n`;
writeFileSync(path.join(absoluteOutputDir, "chart-import-report.json"), reportJson);
writeFileSync(
  path.join(absoluteOutputDir, "chart-import-report.sha256"),
  `${sha256Text(reportJson)}  chart-import-report.json\n`,
);

if (!existsSync(exclusionsPath)) {
  writeJson(exclusionsPath, []);
}

console.log(
  `Imported ${report.importedCharts} charts from ${
    usedFixture ? "fixture data" : sourcePath
  }. Required pool counts: ${JSON.stringify(report.poolCounts)}.`,
);

if (report.duplicateChartKeys.length > 0) {
  console.log(
    `Detected ${report.duplicateChartKeys.length} duplicate chart key rows; duplicates were skipped.`,
  );
}

if (report.repairedRows.length > 0) {
  console.log(
    `Repaired ${report.repairedRows.length} source rows; review data/generated/chart-import-report.json before release.`,
  );
}

if (report.skippedRows.length > 0) {
  console.log(
    `Skipped ${report.skippedRows.length} malformed source rows; review data/generated/chart-import-report.json before release.`,
  );
}

if (report.poolsWithTooFewCharts.length > 0) {
  console.error(
    `Required pools with fewer than 7 eligible charts: ${report.poolsWithTooFewCharts.join(", ")}`,
  );
  process.exitCode = 1;
}

if (strict && report.strictFailures.length > 0) {
  console.error(`Strict chart import failed with ${report.strictFailures.length} issue(s):`);
  for (const failure of report.strictFailures.slice(0, 10)) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
