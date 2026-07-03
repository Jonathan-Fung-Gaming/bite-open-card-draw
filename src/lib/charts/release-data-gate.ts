import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  REQUIRED_CHART_POOLS,
  type ChartImportReport,
  type ImageAsset,
  type NormalizedChart,
} from "./types";

export type ReleaseDataValidationSummary = {
  sourceCsvPath: string;
  sourceCsvSha256: string;
  importReportPath: string;
  importReportSha256: string;
  importedChartCatalogPath: string;
  importedChartCatalogSha256: string;
  imageAssetManifestPath: string;
  imageAssetManifestSha256: string;
  runtimeCatalogPath: string;
  runtimeCatalogSha256: string;
  strictClean: boolean;
  signedDiagnostics: boolean;
  repairedRowCount: number;
  skippedRowCount: number;
  importedCharts: number;
  imageAssetCount: number;
  runtimeChartCount: number;
};

export type ReleaseDataValidationOptions = {
  projectRoot?: string;
  sourcePath?: string;
  generatedDir?: string;
};

function sha256File(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function relative(projectRoot: string, filePath: string) {
  return path.relative(projectRoot, filePath).replace(/\\/g, "/");
}

function isIsoDate(value: string | null) {
  if (!value) {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isCommitEvidence(value: string | null) {
  return Boolean(value && /^[0-9a-f]{7,40}$/i.test(value));
}

function readExpectedReportSha(filePath: string) {
  const [sha] = readFileSync(filePath, "utf8").trim().split(/\s+/);

  return sha ?? "";
}

function collectReleaseDataFailures(
  report: ChartImportReport,
  values: {
    expectedReportSha: string;
    actualReportSha: string;
    currentSourceSha: string;
  },
) {
  const failures: string[] = [];
  const diagnosticsRequireReview =
    report.repairedRows.length > 0 ||
    report.skippedRows.length > 0 ||
    report.strictFailures.length > 0;
  const signedDiagnostics =
    Boolean(report.reviewedBy?.trim()) &&
    isIsoDate(report.reviewedAt) &&
    isCommitEvidence(report.reviewedCommit);
  const strictClean =
    report.strictMode &&
    !diagnosticsRequireReview &&
    report.duplicateChartKeys.length === 0 &&
    report.poolsWithTooFewCharts.length === 0;

  if (report.usedFixture) {
    failures.push("Chart import report used fixture data.");
  }

  if (!report.sourceSha256) {
    failures.push("Chart import report is missing sourceSha256.");
  } else if (report.sourceSha256 !== values.currentSourceSha) {
    failures.push("Chart import report sourceSha256 does not match current source CSV.");
  }

  if (values.expectedReportSha !== values.actualReportSha) {
    failures.push("chart-import-report.sha256 does not match chart-import-report.json.");
  }

  if (report.duplicateChartKeys.length > 0) {
    failures.push(`Chart import report contains ${report.duplicateChartKeys.length} duplicate keys.`);
  }

  if (report.poolsWithTooFewCharts.length > 0) {
    failures.push(
      `Required pools below 7 eligible charts: ${report.poolsWithTooFewCharts.join(", ")}.`,
    );
  }

  for (const pool of REQUIRED_CHART_POOLS) {
    if (report.poolCounts[pool] < 7) {
      failures.push(`Required pool ${pool} has only ${report.poolCounts[pool]} eligible charts.`);
    }
  }

  if (diagnosticsRequireReview && !signedDiagnostics) {
    failures.push(
      "Repaired, skipped, or strict-failure diagnostics require reviewedBy, reviewedAt, and reviewedCommit evidence.",
    );
  }

  if (!strictClean && !signedDiagnostics) {
    failures.push("Release data gate requires strict-clean import evidence or signed review evidence.");
  }

  return {
    failures,
    strictClean,
    signedDiagnostics,
  };
}

function collectChartArtifactFailures(
  report: ChartImportReport,
  importedCharts: readonly NormalizedChart[],
  runtimeCharts: readonly NormalizedChart[],
  imageAssets: readonly ImageAsset[],
) {
  const failures: string[] = [];
  const importedIds = new Set(importedCharts.map((chart) => chart.id));
  const runtimeIds = new Set(runtimeCharts.map((chart) => chart.id));
  const imageAssetChartIds = new Set(imageAssets.flatMap((asset) => asset.chartIds));

  if (importedCharts.length !== report.importedCharts) {
    failures.push(
      `charts.json has ${importedCharts.length} charts but import report records ${report.importedCharts}.`,
    );
  }

  if (runtimeCharts.length !== importedCharts.length) {
    failures.push(
      `charts-with-images.json has ${runtimeCharts.length} charts but charts.json has ${importedCharts.length}.`,
    );
  }

  const missingRuntimeIds = [...importedIds].filter((chartId) => !runtimeIds.has(chartId));
  const extraRuntimeIds = [...runtimeIds].filter((chartId) => !importedIds.has(chartId));

  if (missingRuntimeIds.length > 0 || extraRuntimeIds.length > 0) {
    failures.push(
      `Runtime catalog chart IDs do not match imported chart IDs; missing ${missingRuntimeIds.length}, extra ${extraRuntimeIds.length}.`,
    );
  }

  const missingImageAssetIds = [...importedIds].filter((chartId) => !imageAssetChartIds.has(chartId));
  const extraImageAssetIds = [...imageAssetChartIds].filter((chartId) => !importedIds.has(chartId));

  if (missingImageAssetIds.length > 0 || extraImageAssetIds.length > 0) {
    failures.push(
      `Image asset manifest chart IDs do not match imported chart IDs; missing ${missingImageAssetIds.length}, extra ${extraImageAssetIds.length}.`,
    );
  }

  return failures;
}

export function validateReleaseDataArtifacts(
  options: ReleaseDataValidationOptions = {},
): ReleaseDataValidationSummary {
  const projectRoot = options.projectRoot ?? process.cwd();
  const sourcePath = options.sourcePath ?? "data/source/charts.csv";
  const generatedDir = options.generatedDir ?? "data/generated";
  const absoluteGeneratedDir = path.resolve(projectRoot, generatedDir);
  const sourceCsvPath = path.resolve(projectRoot, sourcePath);
  const importReportPath = path.join(absoluteGeneratedDir, "chart-import-report.json");
  const importReportShaPath = path.join(absoluteGeneratedDir, "chart-import-report.sha256");
  const importedChartCatalogPath = path.join(absoluteGeneratedDir, "charts.json");
  const imageAssetManifestPath = path.join(absoluteGeneratedDir, "image-assets.json");
  const runtimeCatalogPath = path.join(absoluteGeneratedDir, "charts-with-images.json");
  const requiredFiles = [
    sourceCsvPath,
    importReportPath,
    importReportShaPath,
    importedChartCatalogPath,
    imageAssetManifestPath,
    runtimeCatalogPath,
  ];
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));

  if (missingFiles.length > 0) {
    throw new Error(
      `Release data gate is missing required artifact(s): ${missingFiles
        .map((filePath) => relative(projectRoot, filePath))
        .join(", ")}.`,
    );
  }

  const report = readJson<ChartImportReport>(importReportPath);
  const importedCharts = readJson<NormalizedChart[]>(importedChartCatalogPath);
  const imageAssets = readJson<ImageAsset[]>(imageAssetManifestPath);
  const runtimeCharts = readJson<NormalizedChart[]>(runtimeCatalogPath);

  if (!Array.isArray(importedCharts) || importedCharts.length === 0) {
    throw new Error("Release data gate requires a non-empty imported chart catalog.");
  }

  if (!Array.isArray(imageAssets) || imageAssets.length === 0) {
    throw new Error("Release data gate requires a non-empty image asset manifest.");
  }

  if (!Array.isArray(runtimeCharts) || runtimeCharts.length === 0) {
    throw new Error("Release data gate requires a non-empty runtime chart catalog.");
  }

  const actualReportSha = sha256File(importReportPath);
  const expectedReportSha = readExpectedReportSha(importReportShaPath);
  const currentSourceSha = sha256File(sourceCsvPath);
  const { failures, signedDiagnostics, strictClean } = collectReleaseDataFailures(report, {
    expectedReportSha,
    actualReportSha,
    currentSourceSha,
  });
  failures.push(...collectChartArtifactFailures(report, importedCharts, runtimeCharts, imageAssets));

  if (failures.length > 0) {
    throw new Error(`Release data gate failed:\n- ${failures.join("\n- ")}`);
  }

  return {
    sourceCsvPath: relative(projectRoot, sourceCsvPath),
    sourceCsvSha256: currentSourceSha,
    importReportPath: relative(projectRoot, importReportPath),
    importReportSha256: actualReportSha,
    importedChartCatalogPath: relative(projectRoot, importedChartCatalogPath),
    importedChartCatalogSha256: sha256File(importedChartCatalogPath),
    imageAssetManifestPath: relative(projectRoot, imageAssetManifestPath),
    imageAssetManifestSha256: sha256File(imageAssetManifestPath),
    runtimeCatalogPath: relative(projectRoot, runtimeCatalogPath),
    runtimeCatalogSha256: sha256File(runtimeCatalogPath),
    strictClean,
    signedDiagnostics,
    repairedRowCount: report.repairedRows.length,
    skippedRowCount: report.skippedRows.length,
    importedCharts: report.importedCharts,
    imageAssetCount: imageAssets.length,
    runtimeChartCount: runtimeCharts.length,
  };
}
