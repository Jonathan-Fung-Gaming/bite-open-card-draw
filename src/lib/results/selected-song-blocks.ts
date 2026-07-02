import type { DrawStateStore } from "@/lib/draw/draw-state";
import type { ResultStore } from "@/lib/results/result-store";
import type { RoundResultSnapshot } from "./result-engine";

type RoundNumber = 1 | 2 | 3 | 4;

export type FutureSelectedSongConflict = {
  roundNumber: RoundNumber;
  setOrder: 1 | 2;
  source: "active_draw" | "result";
  chartId: string;
  chartName: string;
};

export function selectedSongKeysFromResults(results: readonly RoundResultSnapshot[]) {
  return [
    ...new Set(results.flatMap((result) => result.sets.map((set) => set.selectedChart.songKey))),
  ].sort();
}

export function syncSelectedSongBlocksFromResultStore(
  drawStateStore: DrawStateStore,
  resultStore: ResultStore,
) {
  drawStateStore.replaceSelectedSongKeys(
    selectedSongKeysFromResults(resultStore.exportSnapshot().results),
  );
}

export function findFutureSelectedSongConflicts(input: {
  roundNumber: RoundNumber;
  candidateSongKey: string;
  existingSelectedSongKey?: string | null;
  drawStateStore: DrawStateStore;
  resultStore: ResultStore;
}) {
  if (
    input.existingSelectedSongKey &&
    input.existingSelectedSongKey === input.candidateSongKey
  ) {
    return [];
  }

  const conflicts = new Map<string, FutureSelectedSongConflict>();

  for (let roundNumber = input.roundNumber + 1; roundNumber <= 4; roundNumber += 1) {
    const typedRoundNumber = roundNumber as RoundNumber;

    for (const draw of input.drawStateStore.getRoundDraws(typedRoundNumber)) {
      if (!draw) {
        continue;
      }

      for (const chart of draw.charts) {
        if (chart.songKey !== input.candidateSongKey) {
          continue;
        }

        const key = `${typedRoundNumber}:${draw.setOrder}:active_draw:${chart.id}`;
        conflicts.set(key, {
          roundNumber: typedRoundNumber,
          setOrder: draw.setOrder,
          source: "active_draw",
          chartId: chart.id,
          chartName: chart.name,
        });
      }
    }

    const result = input.resultStore.getRoundResult(typedRoundNumber);

    if (!result) {
      continue;
    }

    for (const set of result.sets) {
      for (const row of set.rows) {
        if (row.chart.songKey !== input.candidateSongKey) {
          continue;
        }

        const key = `${typedRoundNumber}:${set.setOrder}:result:${row.chart.id}`;
        conflicts.set(key, {
          roundNumber: typedRoundNumber,
          setOrder: set.setOrder,
          source: "result",
          chartId: row.chart.id,
          chartName: row.chart.name,
        });
      }
    }
  }

  return [...conflicts.values()].sort(
    (left, right) =>
      left.roundNumber - right.roundNumber ||
      left.setOrder - right.setOrder ||
      left.chartName.localeCompare(right.chartName),
  );
}

export function assertNoFutureSelectedSongConflicts(
  input: Parameters<typeof findFutureSelectedSongConflicts>[0],
) {
  const conflicts = findFutureSelectedSongConflicts(input);

  if (conflicts.length === 0) {
    return;
  }

  const firstConflict = conflicts[0] as FutureSelectedSongConflict;

  throw new Error(
    `Result override is blocked because ${firstConflict.chartName} already appears in future Round ${firstConflict.roundNumber} state. Reset or invalidate affected future rounds before changing this selected song.`,
  );
}
