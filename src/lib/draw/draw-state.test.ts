import { describe, expect, it } from "vitest";
import { normalizeChartRow } from "@/lib/charts/normalize";
import { DrawStateStore } from "./draw-state";

function chartsFor(level: string, count: number, startRow: number, prefix: string) {
  return Array.from({ length: count }, (_, index) =>
    normalizeChartRow(
      {
        name: `${prefix} ${index}`,
        name_kr: `${prefix} ${index}`,
        artist: "Artist",
        label: "test",
        type: "s",
        level,
        bg_img: "",
      },
      startRow + index,
    ),
  );
}

describe("draw state store", () => {
  it("preserves reroll history", () => {
    const store = new DrawStateStore(() => 0);
    store.setChartsForTest(chartsFor("16", 20, 2, "S16"));

    const first = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    const second = store.rerollRoundSet({ roundNumber: 1, setOrder: 1, reason: "test reroll" });

    expect(first.supersededAt).not.toBeNull();
    expect(second.version).toBe(2);
    expect(store.getDrawHistory(1, 1)).toHaveLength(2);
  });

  it("does not allow voting until both sets are drawn", () => {
    const store = new DrawStateStore(() => 0);
    store.setChartsForTest([...chartsFor("16", 20, 2, "S16"), ...chartsFor("17", 20, 50, "S17")]);

    store.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    expect(store.canOpenVoting(1)).toBe(false);

    store.drawRoundSet({ roundNumber: 1, setOrder: 2 });
    expect(store.canOpenVoting(1)).toBe(true);
  });

  it("rerolls one chart into a new draw version", () => {
    const store = new DrawStateStore(() => 0);
    store.setChartsForTest(chartsFor("16", 20, 2, "S16"));
    const first = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    const rerolled = store.rerollOneChart({
      roundNumber: 1,
      setOrder: 1,
      chartId: first.charts[0]?.id ?? "",
      reason: "replace one",
    });

    expect(rerolled.version).toBe(2);
    expect(rerolled.charts).toHaveLength(7);
    expect(new Set(rerolled.charts.map((drawn) => drawn.songKey)).size).toBe(7);
  });

  it("keeps excluded charts out of draws and returns re-included charts to eligibility", () => {
    const charts = chartsFor("16", 8, 2, "S16");
    const store = new DrawStateStore(() => 0);
    const [target] = charts;

    store.setChartsForTest(charts);
    store.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: true,
      reason: "event exclusion",
    });

    const excludedDraw = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    expect(excludedDraw.charts.map((chart) => chart.chartKey)).not.toContain(target?.chartKey);

    store.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: false,
      reason: "event re-inclusion",
    });
    store.resetRound(1);

    const reIncludedDraw = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    expect(reIncludedDraw.charts[0]?.chartKey).toBe(target?.chartKey);
  });
});
