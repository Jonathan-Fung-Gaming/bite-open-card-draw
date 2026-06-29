import { randomUUID } from "node:crypto";
import {
  overlayChartExclusionOverrides,
  upsertChartExclusion,
} from "@/lib/charts/exclusions";
import { buildPoolCounts } from "@/lib/charts/importer";
import { loadRuntimeCharts } from "@/lib/charts/runtime-catalog";
import { REQUIRED_CHART_POOLS, type ChartExclusion, type NormalizedChart } from "@/lib/charts/types";
import { ROUND_SET_DEFINITIONS } from "@/lib/tournament";
import {
  drawChartsForSet,
  getEligibleChartsForSet,
  getRoundSetDefinition,
  secureRandomIndex,
  toDrawnChartSummary,
  type DrawnChartSummary,
  type RandomIndex,
} from "./draw-engine";

export type DrawRecord = {
  id: string;
  roundSetId: string;
  roundNumber: 1 | 2 | 3 | 4;
  setOrder: 1 | 2;
  displayLabel: string;
  version: number;
  eligiblePoolCount: number;
  charts: DrawnChartSummary[];
  createdAt: string;
  supersededAt: string | null;
  reason: string;
};

export type DrawStateStoreSnapshot = {
  drawHistory: DrawRecord[];
  selectedSongKeys: string[];
  excludedChartKeys?: string[];
  chartExclusions?: ChartExclusion[];
};

function drawKey(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2) {
  return `${roundNumber}:${setOrder}`;
}

export class DrawStateStore {
  private charts: NormalizedChart[] | null = null;
  private drawHistory = new Map<string, DrawRecord[]>();
  private selectedSongKeys = new Set<string>();
  private chartExclusions: ChartExclusion[] = [];

  constructor(private readonly randomIndex: RandomIndex = secureRandomIndex) {}

  private getBaseCharts() {
    this.charts ??= loadRuntimeCharts();
    return this.charts;
  }

  getCharts() {
    return overlayChartExclusionOverrides(this.getBaseCharts(), this.chartExclusions);
  }

  setChartsForTest(charts: NormalizedChart[]) {
    this.charts = charts;
  }

  setExcludedChartKeys(chartKeys: Iterable<string>) {
    const updatedAt = new Date().toISOString();

    this.chartExclusions = [...new Set(chartKeys)].sort().map((chartKey) => ({
      chartKey,
      excluded: true,
      reason: "Imported chart exclusion key.",
      updatedAt,
    }));
  }

  getExcludedChartKeys() {
    return this.chartExclusions
      .filter((exclusion) => exclusion.excluded)
      .map((exclusion) => exclusion.chartKey)
      .sort();
  }

  getChartExclusions() {
    return this.chartExclusions.map((exclusion) => ({ ...exclusion }));
  }

  updateChartExclusion(input: { chartKey: string; excluded: boolean; reason: string }) {
    const chart = this.getBaseCharts().find((candidate) => candidate.chartKey === input.chartKey);

    if (!chart) {
      throw new Error("Unknown chart key.");
    }

    const previous = this.chartExclusions;
    const next = upsertChartExclusion(
      this.chartExclusions,
      input.chartKey,
      input.excluded,
      input.reason,
    );

    this.chartExclusions = next;

    if (input.excluded) {
      const chartPool = REQUIRED_CHART_POOLS.find((pool) => pool === chart.displayDifficulty);
      const poolCounts = buildPoolCounts(this.getCharts());

      if (chartPool && poolCounts[chartPool] < 7) {
        this.chartExclusions = previous;
        throw new Error(
          `Chart exclusion would leave fewer than 7 eligible charts in ${chartPool}.`,
        );
      }
    }

    return next.find((exclusion) => exclusion.chartKey === input.chartKey) as ChartExclusion;
  }

  replaceSelectedSongKeys(songKeys: Iterable<string>) {
    this.selectedSongKeys = new Set(songKeys);
  }

  markSelectedSong(songKey: string) {
    this.selectedSongKeys.add(songKey);
  }

  unmarkSelectedSongs(songKeys: Iterable<string>) {
    for (const songKey of songKeys) {
      this.selectedSongKeys.delete(songKey);
    }
  }

  getActiveDraw(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2) {
    return this.getDrawHistory(roundNumber, setOrder).find((draw) => !draw.supersededAt) ?? null;
  }

  getDrawHistory(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2) {
    return this.drawHistory.get(drawKey(roundNumber, setOrder)) ?? [];
  }

  getRoundDraws(roundNumber: 1 | 2 | 3 | 4) {
    return ROUND_SET_DEFINITIONS.filter((set) => set.roundNumber === roundNumber).map((set) =>
      this.getActiveDraw(roundNumber, set.setOrder),
    );
  }

  canOpenVoting(roundNumber: 1 | 2 | 3 | 4) {
    return this.getRoundDraws(roundNumber).every(Boolean);
  }

  resetRound(roundNumber: 1 | 2 | 3 | 4) {
    this.drawHistory.delete(drawKey(roundNumber, 1));
    this.drawHistory.delete(drawKey(roundNumber, 2));
  }

  drawRoundSet(input: {
    roundNumber: 1 | 2 | 3 | 4;
    setOrder: 1 | 2;
    reason?: string;
    allowRedraw?: boolean;
  }) {
    const existing = this.getActiveDraw(input.roundNumber, input.setOrder);

    if (existing && !input.allowRedraw) {
      throw new Error(
        `${existing.displayLabel} is already drawn. Use a reroll action to replace it.`,
      );
    }

    return this.createDrawRecord({
      roundNumber: input.roundNumber,
      setOrder: input.setOrder,
      reason: input.reason ?? "Initial draw",
    });
  }

  rerollRoundSet(input: { roundNumber: 1 | 2 | 3 | 4; setOrder: 1 | 2; reason: string }) {
    return this.createDrawRecord(input);
  }

  rerollFullRound(input: { roundNumber: 1 | 2 | 3 | 4; reason: string }) {
    const first = this.createDrawRecord({
      roundNumber: input.roundNumber,
      setOrder: 1,
      reason: input.reason,
    });
    const second = this.createDrawRecord({
      roundNumber: input.roundNumber,
      setOrder: 2,
      reason: input.reason,
    });

    return [first, second] as const;
  }

  rerollOneChart(input: {
    roundNumber: 1 | 2 | 3 | 4;
    setOrder: 1 | 2;
    chartId: string;
    reason: string;
  }) {
    const current = this.getActiveDraw(input.roundNumber, input.setOrder);

    if (!current) {
      throw new Error("Cannot reroll one chart before the set is drawn.");
    }

    const targetIndex = current.charts.findIndex((chart) => chart.id === input.chartId);

    if (targetIndex < 0) {
      throw new Error("Chart is not part of the active draw.");
    }

    const set = getRoundSetDefinition(input.roundNumber, input.setOrder);
    const otherSetDraw = this.getActiveDraw(input.roundNumber, input.setOrder === 1 ? 2 : 1);
    const blockedSongs = new Set([
      ...this.selectedSongKeys,
      ...(otherSetDraw?.charts.map((chart) => chart.songKey) ?? []),
      ...current.charts.filter((chart) => chart.id !== input.chartId).map((chart) => chart.songKey),
    ]);
    const currentChartKeys = new Set(
      current.charts.filter((chart) => chart.id !== input.chartId).map((chart) => chart.chartKey),
    );
    const eligible = getEligibleChartsForSet({
      charts: this.getCharts(),
      set,
      excludedChartKeys: new Set([...this.getExcludedChartKeys(), ...currentChartKeys]),
      selectedSongKeys: this.selectedSongKeys,
      sameRoundBlockedSongKeys: blockedSongs,
    });

    if (eligible.length < 1) {
      throw new Error(`No eligible replacement chart exists for ${set.displayLabel}.`);
    }

    const replacement = toDrawnChartSummary(
      eligible[this.randomIndex(eligible.length)] as NormalizedChart,
    );
    const charts = [...current.charts];
    charts[targetIndex] = replacement;

    return this.createDrawRecord({
      roundNumber: input.roundNumber,
      setOrder: input.setOrder,
      reason: input.reason,
      explicitCharts: charts,
      eligiblePoolCount: eligible.length,
    });
  }

  private createDrawRecord(input: {
    roundNumber: 1 | 2 | 3 | 4;
    setOrder: 1 | 2;
    reason: string;
    explicitCharts?: DrawnChartSummary[];
    eligiblePoolCount?: number;
  }) {
    const set = getRoundSetDefinition(input.roundNumber, input.setOrder);
    const key = drawKey(input.roundNumber, input.setOrder);
    const history = this.drawHistory.get(key) ?? [];
    const now = new Date().toISOString();

    for (const draw of history) {
      if (!draw.supersededAt) {
        draw.supersededAt = now;
      }
    }

    const otherSetDraw = this.getActiveDraw(input.roundNumber, input.setOrder === 1 ? 2 : 1);
    const drawn = input.explicitCharts
      ? {
          eligiblePoolCount: input.eligiblePoolCount ?? input.explicitCharts.length,
          charts: input.explicitCharts,
        }
      : drawChartsForSet(
          {
            charts: this.getCharts(),
            set,
            excludedChartKeys: new Set(this.getExcludedChartKeys()),
            selectedSongKeys: this.selectedSongKeys,
            sameRoundBlockedSongKeys: new Set(
              otherSetDraw?.charts.map((chart) => chart.songKey) ?? [],
            ),
          },
          this.randomIndex,
        );

    const record: DrawRecord = {
      id: randomUUID(),
      roundSetId: set.id,
      roundNumber: input.roundNumber,
      setOrder: input.setOrder,
      displayLabel: set.displayLabel,
      version: history.length + 1,
      eligiblePoolCount: drawn.eligiblePoolCount,
      charts: drawn.charts,
      createdAt: now,
      supersededAt: null,
      reason: input.reason,
    };

    this.drawHistory.set(key, [...history, record]);

    return record;
  }

  exportSnapshot(): DrawStateStoreSnapshot {
    return {
      drawHistory: [...this.drawHistory.values()]
        .flat()
        .map((draw) => ({
          ...draw,
          charts: draw.charts.map((chart) => ({ ...chart })),
        })),
      selectedSongKeys: [...this.selectedSongKeys].sort(),
      excludedChartKeys: this.getExcludedChartKeys(),
      chartExclusions: this.getChartExclusions(),
    };
  }

  importSnapshot(snapshot: DrawStateStoreSnapshot) {
    this.drawHistory = new Map();

    for (const draw of snapshot.drawHistory) {
      const key = drawKey(draw.roundNumber, draw.setOrder);
      const history = this.drawHistory.get(key) ?? [];

      history.push({
        ...draw,
        roundSetId: draw.roundSetId ?? getRoundSetDefinition(draw.roundNumber, draw.setOrder).id,
        charts: draw.charts.map((chart) => ({ ...chart })),
      });
      this.drawHistory.set(key, history.sort((left, right) => left.version - right.version));
    }

    this.selectedSongKeys = new Set(snapshot.selectedSongKeys);
    this.chartExclusions =
      snapshot.chartExclusions?.map((exclusion) => ({ ...exclusion })) ??
      (snapshot.excludedChartKeys ?? []).map((chartKey) => ({
        chartKey,
        excluded: true,
        reason: "Imported legacy chart exclusion key.",
        updatedAt: new Date().toISOString(),
      }));
  }
}
