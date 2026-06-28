import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createFallbackChartRows,
  importChartRows,
  parseChartCsv,
} from "../src/lib/charts/importer";

function readArg(name: string, fallback: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));

  return arg ? arg.slice(prefix.length) : fallback;
}

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

const sourcePath = readArg("source", "data/source/charts.csv");
const outputDir = readArg("output-dir", "data/generated");
const absoluteSourcePath = path.resolve(process.cwd(), sourcePath);
const absoluteOutputDir = path.resolve(process.cwd(), outputDir);
const usedFixture = !existsSync(absoluteSourcePath);

const rows = usedFixture
  ? createFallbackChartRows()
  : parseChartCsv(readFileSync(absoluteSourcePath, "utf8"));

const { charts, report } = importChartRows(rows, {
  sourcePath,
  usedFixture,
});

mkdirSync(absoluteOutputDir, { recursive: true });
writeJson(path.join(absoluteOutputDir, "charts.json"), charts);
writeJson(path.join(absoluteOutputDir, "chart-import-report.json"), report);

const exclusionsPath = path.join(absoluteOutputDir, "chart-exclusions.json");

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

if (report.poolsWithTooFewCharts.length > 0) {
  console.error(
    `Required pools with fewer than 7 eligible charts: ${report.poolsWithTooFewCharts.join(", ")}`,
  );
  process.exitCode = 1;
}
