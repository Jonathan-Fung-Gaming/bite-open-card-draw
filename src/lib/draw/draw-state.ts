import { randomUUID } from "node:crypto";
import { loadRuntimeCharts } from "@/lib/charts/runtime-catalog";
import type { NormalizedChart } from "@/lib/charts/types";
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
  excludedChartKeys: string[];
};

function drawKey(roundNumber: 1 | 2 | 3 | 4, setOrder: 1 | 2) {
  return `${roundNumber}:${setOrder}`;
}

export class DrawStateStore {
  private charts: NormalizedChart[] | null = null;
  private drawHistory = new Map<string, DrawRecord[]>();
  private selectedSongKeys = new Set<string>();
  private excludedChartKeys = new Set<string>();

  constructor(private readonly randomIndex: RandomIndex = secureRandomIndex) {}

  getCharts() {
    this.charts ??= loadRuntimeCharts();
    return this.charts;
  }

  setChartsForTest(charts: NormalizedChart[]) {
    this.charts = charts;
  }

  setExcludedChartKeys(chartKeys: Iterable<string>) {
    this.excludedChartKeys = new Set(chartKeys);
  }

  getExcludedChartKeys() {
    return [...this.excludedChartKeys].sort();
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
      excludedChartKeys: new Set([...this.excludedChartKeys, ...currentChartKeys]),
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
            excludedChartKeys: this.excludedChartKeys,
            selectedSongKeys: this.selectedSongKeys,
            sameRoundBlockedSongKeys: new Set(
              otherSetDraw?.charts.map((chart) => chart.songKey) ?? [],
            ),
          },
          this.randomIndex,
        );

    const record: DrawRecord = {
      id: randomUUID(),
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
    };
  }

  importSnapshot(snapshot: DrawStateStoreSnapshot) {
    this.drawHistory = new Map();

    for (const draw of snapshot.drawHistory) {
      const key = drawKey(draw.roundNumber, draw.setOrder);
      const history = this.drawHistory.get(key) ?? [];

      history.push({
        ...draw,
        charts: draw.charts.map((chart) => ({ ...chart })),
      });
      this.drawHistory.set(key, history.sort((left, right) => left.version - right.version));
    }

    this.selectedSongKeys = new Set(snapshot.selectedSongKeys);
    this.excludedChartKeys = new Set(snapshot.excludedChartKeys);
  }
}
