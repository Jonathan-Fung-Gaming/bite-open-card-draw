import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateReleaseDataArtifacts } from "./release-data-gate";
import { REQUIRED_CHART_POOLS, type ChartImportReport } from "./types";

function sha256Text(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function poolCounts(count = 7) {
  return Object.fromEntries(REQUIRED_CHART_POOLS.map((pool) => [pool, count])) as Record<
    (typeof REQUIRED_CHART_POOLS)[number],
    number
  >;
}

function baseReport(sourceSha256: string): ChartImportReport {
  return {
    sourcePath: "data/source/charts.csv",
    usedFixture: false,
    generatedAt: "2026-07-03T00:00:00.000Z",
    sourceSha256,
    strictMode: true,
    reviewedBy: null,
    reviewedAt: null,
    reviewedCommit: null,
    totalSourceRows: 1,
    importedCharts: 1,
    repairedRows: [],
    skippedRows: [],
    outOfScopeRows: [],
    duplicateChartKeys: [],
    poolCounts: poolCounts(),
    poolsWithTooFewCharts: [],
    strictFailures: [],
  };
}

function writeReleaseFixture(reportPatch: Partial<ChartImportReport> = {}) {
  const projectRoot = mkdtempSync(path.join(tmpdir(), "release-data-gate-"));
  const sourcePath = path.join(projectRoot, "data/source/charts.csv");
  const generatedDir = path.join(projectRoot, "data/generated");
  const sourceText = "name,name_kr,artist,label,type,level,bg_img\n";

  mkdirSync(path.dirname(sourcePath), { recursive: true });
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(sourcePath, sourceText);

  const report = {
    ...baseReport(sha256Text(sourceText)),
    ...reportPatch,
  };
  const reportJson = `${JSON.stringify(report, null, 2)}\n`;

  writeFileSync(path.join(generatedDir, "chart-import-report.json"), reportJson);
  writeFileSync(
    path.join(generatedDir, "chart-import-report.sha256"),
    `${sha256Text(reportJson)}  chart-import-report.json\n`,
  );
  writeFileSync(
    path.join(generatedDir, "charts.json"),
    `${JSON.stringify([
      {
        id: "chart-1",
        localImagePath: null,
      },
    ])}\n`,
  );
  writeFileSync(
    path.join(generatedDir, "image-assets.json"),
    `${JSON.stringify([
      {
        remoteUrl: "https://example.com/a.png",
        localPath: "/chart-images/cache/a.png",
        status: "cached",
        chartIds: ["chart-1"],
      },
    ])}\n`,
  );
  writeFileSync(
    path.join(generatedDir, "charts-with-images.json"),
    `${JSON.stringify([
      {
        id: "chart-1",
        localImagePath: "/chart-images/cache/a.png",
      },
    ])}\n`,
  );

  return {
    projectRoot,
    generatedDir,
  };
}

describe("release data gate", () => {
  it("passes strict clean release artifacts", () => {
    const { projectRoot } = writeReleaseFixture();
    const summary = validateReleaseDataArtifacts({ projectRoot });

    expect(summary.strictClean).toBe(true);
    expect(summary.signedDiagnostics).toBe(false);
    expect(summary.sourceCsvSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(summary.importReportSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails unsigned repaired or skipped diagnostics", () => {
    const { projectRoot } = writeReleaseFixture({
      strictMode: false,
      repairedRows: [{ sourceRowNumber: 2, reason: "known row repair" }],
    });

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      "reviewedBy, reviewedAt, and reviewedCommit",
    );
  });

  it("fails clean non-strict artifacts without signed review evidence", () => {
    const { projectRoot } = writeReleaseFixture({
      strictMode: false,
    });

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      "strict-clean import evidence or signed review evidence",
    );
  });

  it("accepts signed repaired or skipped diagnostics", () => {
    const { projectRoot } = writeReleaseFixture({
      strictMode: false,
      repairedRows: [{ sourceRowNumber: 2, reason: "known row repair" }],
      skippedRows: [{ sourceRowNumber: 3, reason: "unsupported chart type" }],
      reviewedBy: "release captain",
      reviewedAt: "2026-07-03T00:00:00.000Z",
      reviewedCommit: "abcdef1234567890",
    });
    const summary = validateReleaseDataArtifacts({ projectRoot });

    expect(summary.strictClean).toBe(false);
    expect(summary.signedDiagnostics).toBe(true);
    expect(summary.repairedRowCount).toBe(1);
    expect(summary.skippedRowCount).toBe(1);
  });

  it("fails fixture mode, duplicate keys, and underfilled pools", () => {
    const { projectRoot } = writeReleaseFixture({
      usedFixture: true,
      duplicateChartKeys: [
        {
          chartKey: "duplicate",
          firstSourceRowNumber: 2,
          duplicateSourceRowNumber: 3,
        },
      ],
      poolCounts: { ...poolCounts(), S16: 6 },
      poolsWithTooFewCharts: ["S16"],
    });

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      /fixture data[\s\S]*duplicate keys[\s\S]*S16/,
    );
  });

  it("fails stale source CSV and stale import report hashes", () => {
    const { projectRoot, generatedDir } = writeReleaseFixture({
      sourceSha256: "0".repeat(64),
    });

    writeFileSync(
      path.join(generatedDir, "chart-import-report.sha256"),
      `${"1".repeat(64)}  chart-import-report.json\n`,
    );

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      /sourceSha256[\s\S]*chart-import-report\.sha256/,
    );
  });

  it("fails missing or empty image artifacts", () => {
    const { projectRoot, generatedDir } = writeReleaseFixture();

    writeFileSync(path.join(generatedDir, "image-assets.json"), "[]\n");

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      "non-empty image asset manifest",
    );

    const second = writeReleaseFixture();
    writeFileSync(path.join(second.generatedDir, "charts-with-images.json"), "[]\n");

    expect(() => validateReleaseDataArtifacts({ projectRoot: second.projectRoot })).toThrow(
      "non-empty runtime chart catalog",
    );
  });

  it("fails stale runtime catalog and image manifest chart IDs", () => {
    const { projectRoot, generatedDir } = writeReleaseFixture();

    writeFileSync(
      path.join(generatedDir, "charts-with-images.json"),
      `${JSON.stringify([
        {
          id: "stale-chart",
          localImagePath: "/chart-images/cache/a.png",
        },
      ])}\n`,
    );

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      "Runtime catalog chart IDs do not match imported chart IDs",
    );

    const second = writeReleaseFixture();
    writeFileSync(
      path.join(second.generatedDir, "image-assets.json"),
      `${JSON.stringify([
        {
          remoteUrl: "https://example.com/a.png",
          localPath: "/chart-images/cache/a.png",
          status: "cached",
          chartIds: ["stale-chart"],
        },
      ])}\n`,
    );

    expect(() => validateReleaseDataArtifacts({ projectRoot: second.projectRoot })).toThrow(
      "Image asset manifest chart IDs do not match imported chart IDs",
    );
  });

  it("requires reviewedAt to be the generated ISO UTC format", () => {
    const { projectRoot } = writeReleaseFixture({
      strictMode: false,
      skippedRows: [{ sourceRowNumber: 2, reason: "unsupported chart type" }],
      reviewedBy: "release captain",
      reviewedAt: "July 3, 2026",
      reviewedCommit: "abcdef1234567890",
    });

    expect(() => validateReleaseDataArtifacts({ projectRoot })).toThrow(
      "reviewedBy, reviewedAt, and reviewedCommit",
    );
  });
});
