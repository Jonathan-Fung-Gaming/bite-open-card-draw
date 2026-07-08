import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createFallbackChartRows,
  importChartRows,
  parseChartCsv,
  parseChartCsvWithReport,
} from "./importer";
import { isDisallowedSpecialChartName } from "./normalize";
import { REQUIRED_CHART_POOLS } from "./types";

describe("chart importer", () => {
  it("imports the provided source CSV and validates required pools", () => {
    const sourcePath = path.join(process.cwd(), "data/source/charts.csv");
    const rows = parseChartCsv(readFileSync(sourcePath, "utf8"));
    const { charts, report } = importChartRows(rows, {
      sourcePath,
      generatedAt: "test",
    });

    expect(charts.length).toBeGreaterThan(0);
    expect(report.filteredRows.length).toBeGreaterThan(0);
    expect(report.poolsWithTooFewCharts).toEqual([]);
    expect(charts.every((chart) => !isDisallowedSpecialChartName(chart.name, chart.nameKr))).toBe(
      true,
    );
    expect(charts.some((chart) => /remix/i.test(`${chart.name} ${chart.nameKr}`))).toBe(true);

    for (const pool of REQUIRED_CHART_POOLS) {
      expect(report.poolCounts[pool]).toBeGreaterThanOrEqual(7);
    }
  });

  it("deduplicates duplicate chart keys safely", () => {
    const csv = [
      "name,name_kr,artist,label,type,level,bg_img",
      "Same,Same,Artist,s,s,16,https://example.com/a.png",
      "Same,Same,Artist,s,s,16,https://example.com/a.png",
    ].join("\n");

    const { charts, report } = importChartRows(parseChartCsv(csv), {
      sourcePath: "inline.csv",
      generatedAt: "test",
    });

    expect(charts).toHaveLength(1);
    expect(report.duplicateChartKeys).toHaveLength(1);
  });

  it("rejects CSV headers with extra columns", () => {
    const csv = [
      "name,name_kr,artist,label,type,level,bg_img,notes",
      "Song,Song,Artist,s,s,16,https://example.com/a.png,extra",
    ].join("\n");

    expect(() => parseChartCsv(csv)).toThrow("header must exactly match");
  });

  it("rejects CSV headers with misordered columns", () => {
    const csv = [
      "name,artist,name_kr,label,type,level,bg_img",
      "Song,Artist,Song,s,s,16,https://example.com/a.png",
    ].join("\n");

    expect(() => parseChartCsv(csv)).toThrow("header order mismatch");
  });

  it("rejects unexpected trailing row columns after bg_img", () => {
    const csv = [
      "name,name_kr,artist,label,type,level,bg_img",
      "Song,Song,Artist,s,s,16,https://example.com/a.png,unexpected",
    ].join("\n");

    expect(() => parseChartCsv(csv)).toThrow("unexpected extra columns after bg_img");
  });

  it("applies chart exclusions before required pool validation", () => {
    const rows = createFallbackChartRows();
    const { charts: baseline } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
    });
    const target = baseline.find((chart) => chart.displayDifficulty === "S16");

    expect(target).toBeDefined();

    const exclusion = {
      chartKey: target?.chartKey ?? "",
      excluded: true,
      reason: "event rule exclusion",
      updatedAt: "test",
    };
    const { charts, report } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
      exclusions: [exclusion],
    });
    const excludedChart = charts.find((chart) => chart.chartKey === target?.chartKey);

    expect(excludedChart?.excluded).toBe(true);
    expect(excludedChart?.exclusionReason).toBe("event rule exclusion");
    expect(report.poolCounts.S16).toBe(6);
    expect(report.poolsWithTooFewCharts).toContain("S16");

    const { charts: restored, report: restoredReport } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
      exclusions: [{ ...exclusion, excluded: false, reason: "event re-inclusion" }],
    });

    expect(restored.find((chart) => chart.chartKey === target?.chartKey)?.excluded).toBe(false);
    expect(restoredReport.poolCounts.S16).toBe(7);
    expect(restoredReport.poolsWithTooFewCharts).not.toContain("S16");
  });

  it("repairs source rows with unquoted commas in mirrored title fields", () => {
    const csv = [
      "name,name_kr,artist,label,type,level,bg_img",
      "Simon Says, EURODANCE!!,Simon Says, EURODANCE!!,Jehezukiel,s,s,16,https://example.com/a.png",
    ].join("\n");

    const [row] = parseChartCsv(csv);

    expect(row).toMatchObject({
      name: "Simon Says, EURODANCE!!",
      name_kr: "Simon Says, EURODANCE!!",
      artist: "Jehezukiel",
      type: "s",
      level: "16",
    });
  });

  it("reports repaired rows for signed final-event import review", () => {
    const csv = [
      "name,name_kr,artist,label,type,level,bg_img",
      "Simon Says, EURODANCE!!,Simon Says, EURODANCE!!,Jehezukiel,s,s,16,https://example.com/a.png",
    ].join("\n");
    const parsed = parseChartCsvWithReport(csv);
    const { report } = importChartRows(parsed.rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
      sourceSha256: parsed.sourceSha256,
      repairedRows: parsed.repairedRows,
      reviewedBy: "release captain",
      reviewedAt: "2026-07-02T00:00:00.000Z",
      reviewedCommit: "abcdef1234567890",
    });

    expect(report.repairedRows).toEqual([
      {
        sourceRowNumber: 2,
        reason: "Row had 9 columns; reconstructed the expected 7 columns.",
      },
    ]);
    expect(report.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.reviewedBy).toBe("release captain");
    expect(report.reviewedCommit).toBe("abcdef1234567890");
  });

  it("strict mode reports malformed levels and duplicate repairs as failures", () => {
    const baseRow = createFallbackChartRows()[0];

    if (!baseRow) {
      throw new Error("Fallback chart fixture did not generate rows.");
    }

    const rows = [
      { ...baseRow, level: "16x" },
      { ...baseRow, name: "Spaced", name_kr: "Spaced", level: " 16 " },
      { ...baseRow, name: "Empty", name_kr: "Empty", level: "" },
      { ...baseRow, name: "Decimal", name_kr: "Decimal", level: "16.5" },
    ];
    const { report } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
      strict: true,
      repairedRows: [{ sourceRowNumber: 99, reason: "reviewed repair" }],
    });

    expect(report.skippedRows.map((row) => row.sourceRowNumber)).toEqual([2, 3, 4, 5]);
    expect(report.strictFailures).toEqual(
      expect.arrayContaining([
        "Row 99 was repaired: reviewed repair",
        expect.stringContaining("Row 2 was skipped: Unsupported chart level: 16x"),
        expect.stringContaining("Row 3 was skipped: Unsupported chart level:  16 "),
        expect.stringContaining("Row 4 was skipped: Unsupported chart level: "),
        expect.stringContaining("Row 5 was skipped: Unsupported chart level: 16.5"),
      ]),
    );
  });

  it("reports valid rows outside required tournament pools without counting them as eligible", () => {
    const rows = [
      {
        name: "Wrong Pool",
        name_kr: "Wrong Pool",
        artist: "Artist",
        label: "d",
        type: "d",
        level: "16",
        bg_img: "https://example.com/a.png",
      },
    ];
    const { charts, report } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
    });

    expect(charts).toHaveLength(1);
    expect(charts[0]?.tournamentScope).toBe(false);
    expect(report.outOfScopeRows).toEqual([
      { sourceRowNumber: 2, reason: "D16 is outside required tournament pools." },
    ]);
    expect(report.poolCounts.S16).toBe(0);
  });

  it("filters Short Cut and Full Song rows while preserving Remixes", () => {
    const rows = [
      {
        name: "Euphorianic - SHORT CUT -",
        name_kr: "Euphorianic - SHORT CUT -",
        artist: "Artist",
        label: "s",
        type: "s",
        level: "16",
        bg_img: "https://example.com/short-cut.png",
      },
      {
        name: "Gargoyle - FULL SONG -",
        name_kr: "Gargoyle - FULL SONG -",
        artist: "Artist",
        label: "d",
        type: "d",
        level: "23",
        bg_img: "https://example.com/full-song.png",
      },
      {
        name: "Stardream -Eurobeat Remix-",
        name_kr: "Stardream -Eurobeat Remix-",
        artist: "Artist",
        label: "s",
        type: "s",
        level: "16",
        bg_img: "https://example.com/remix.png",
      },
    ];
    const { charts, report } = importChartRows(rows, {
      sourcePath: "fixture.csv",
      generatedAt: "test",
    });

    expect(charts.map((chart) => chart.name)).toEqual(["Stardream -Eurobeat Remix-"]);
    expect(report.filteredRows).toEqual([
      {
        sourceRowNumber: 2,
        reason: "name contains disallowed Short Cut marker.",
      },
      {
        sourceRowNumber: 3,
        reason: "name contains disallowed Full Song marker.",
      },
    ]);
    expect(report.skippedRows).toEqual([]);
    expect(report.poolCounts.S16).toBe(1);
    expect(report.poolCounts.D23).toBe(0);
  });
});
