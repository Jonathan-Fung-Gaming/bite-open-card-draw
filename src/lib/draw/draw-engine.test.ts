import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import { drawChartsForSet, getEligibleChartsForSet, getRoundSetDefinition } from "./draw-engine";

function chart(name: string, level: string, row: number, type = "s") {
  return normalizeChartRow(
    {
      name,
      name_kr: name,
      artist: "Artist",
      label: "test",
      type,
      level,
      bg_img: "",
    },
    row,
  );
}

describe("draw engine", () => {
  it("draws exactly 7 unique charts for a set", () => {
    const charts = Array.from({ length: 10 }, (_, index) => chart(`Song ${index}`, "16", index + 2));
    const result = drawChartsForSet(
      {
        charts,
        set: getRoundSetDefinition(1, 1),
      },
      () => 0,
    );

    expect(result.charts).toHaveLength(7);
    expect(new Set(result.charts.map((drawn) => drawn.chartKey)).size).toBe(7);
  });

  it("filters excluded charts and selected prior songs", () => {
    const charts = Array.from({ length: 10 }, (_, index) => chart(`Song ${index}`, "16", index + 2));
    const eligible = getEligibleChartsForSet({
      charts,
      set: getRoundSetDefinition(1, 1),
      excludedChartKeys: new Set([charts[0]?.chartKey ?? ""]),
      selectedSongKeys: new Set([charts[1]?.songKey ?? ""]),
    });

    expect(eligible).toHaveLength(8);
    expect(eligible.map((entry) => entry.chartKey)).not.toContain(charts[0]?.chartKey);
    expect(eligible.map((entry) => entry.songKey)).not.toContain(charts[1]?.songKey);
  });

  it("blocks songs already drawn in the other set of the same round", () => {
    const charts = [
      chart("Shared", "16", 2),
      chart("Shared", "17", 3),
      ...Array.from({ length: 7 }, (_, index) => chart(`S17 ${index}`, "17", index + 4)),
    ];
    const eligible = getEligibleChartsForSet({
      charts,
      set: getRoundSetDefinition(1, 2),
      sameRoundBlockedSongKeys: new Set([charts[0]?.songKey ?? ""]),
    });

    expect(eligible.map((entry) => entry.name)).not.toContain("Shared");
  });
});
