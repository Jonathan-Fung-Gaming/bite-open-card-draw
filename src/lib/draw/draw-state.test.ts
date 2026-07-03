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
    const target = first.charts[0];

    const rerolled = store.rerollOneChart({
      roundNumber: 1,
      setOrder: 1,
      chartId: target?.id ?? "",
      reason: "replace one",
    });

    expect(rerolled.version).toBe(2);
    expect(rerolled.charts).toHaveLength(7);
    expect(new Set(rerolled.charts.map((drawn) => drawn.songKey)).size).toBe(7);
    expect(rerolled.charts[0]?.id).not.toBe(target?.id);
    expect(rerolled.charts[0]?.songKey).not.toBe(target?.songKey);
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

  it("keeps one latest exclusion state per chart key", () => {
    const charts = chartsFor("16", 8, 2, "S16");
    const store = new DrawStateStore(() => 0);
    const [target] = charts;

    store.setChartsForTest(charts);
    store.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: true,
      reason: "event exclusion",
    });
    store.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: false,
      reason: "metadata fixed",
    });
    store.updateChartExclusion({
      chartKey: target?.chartKey ?? "",
      excluded: true,
      reason: "late event exclusion",
    });

    const [exclusion] = store.getChartExclusions();

    expect(store.getChartExclusions()).toHaveLength(1);
    expect(exclusion).toMatchObject({
      chartKey: target?.chartKey,
      excluded: true,
      reason: "late event exclusion",
    });
    expect(exclusion?.updatedAt).toEqual(expect.any(String));
  });

  it("does not supersede the active draw when a set reroll cannot be drawn", () => {
    const store = new DrawStateStore(() => 0);
    store.setChartsForTest(chartsFor("16", 7, 2, "S16"));
    const first = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    store.setChartsForTest(chartsFor("16", 6, 100, "S16 replacement"));

    expect(() =>
      store.rerollRoundSet({ roundNumber: 1, setOrder: 1, reason: "bad reroll" }),
    ).toThrow("has 6 eligible charts");
    expect(first.supersededAt).toBeNull();
    expect(store.getActiveDraw(1, 1)?.id).toBe(first.id);
    expect(store.getDrawHistory(1, 1)).toHaveLength(1);
  });

  it("does not commit either set when a full-round reroll fails on the second set", () => {
    const store = new DrawStateStore(() => 0);
    store.setChartsForTest([...chartsFor("16", 7, 2, "S16"), ...chartsFor("17", 7, 40, "S17")]);
    const first = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });
    const second = store.drawRoundSet({ roundNumber: 1, setOrder: 2 });

    store.setChartsForTest([
      ...chartsFor("16", 7, 100, "S16 replacement"),
      ...chartsFor("17", 6, 200, "S17 replacement"),
    ]);

    expect(() => store.rerollFullRound({ roundNumber: 1, reason: "bad full reroll" })).toThrow(
      "has 6 eligible charts",
    );
    expect(store.getActiveDraw(1, 1)?.id).toBe(first.id);
    expect(store.getActiveDraw(1, 2)?.id).toBe(second.id);
    expect(first.supersededAt).toBeNull();
    expect(second.supersededAt).toBeNull();
    expect(store.getDrawHistory(1, 1)).toHaveLength(1);
    expect(store.getDrawHistory(1, 2)).toHaveLength(1);
  });

  it("snapshots eligible chart ids and draw exclusion context", () => {
    const charts = chartsFor("16", 10, 2, "S16");
    const excluded = charts[0];
    const selected = charts[1];
    const store = new DrawStateStore(() => 0);

    store.setChartsForTest(charts);
    store.updateChartExclusion({
      chartKey: excluded?.chartKey ?? "",
      excluded: true,
      reason: "event exclusion",
    });
    store.markSelectedSong(selected?.songKey ?? "");

    const draw = store.drawRoundSet({ roundNumber: 1, setOrder: 1 });

    expect(draw.excludedChartKeysSnapshot).toEqual([excluded?.chartKey]);
    expect(draw.selectedSongKeysSnapshot).toEqual([selected?.songKey]);
    expect(draw.sameRoundBlockedSongKeysSnapshot).toEqual([]);
    expect(draw.eligibleChartIds).toHaveLength(draw.eligiblePoolCount);
    expect(draw.eligibleChartIds).not.toContain(excluded?.id);
    expect(draw.eligibleChartIds).not.toContain(selected?.id);
  });
});
