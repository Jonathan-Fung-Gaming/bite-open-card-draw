import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { importChartRows, parseChartCsv } from "./importer";
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
    expect(report.poolsWithTooFewCharts).toEqual([]);

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
});
