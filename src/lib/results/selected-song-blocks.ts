import type { DrawRecord, DrawStateStore } from "@/lib/draw/draw-state";
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

export type PriorSelectedSongBlock = {
  songKey: string;
  selectedInRoundNumber: RoundNumber;
  chartId: string;
  chartName: string;
};

export type PriorSelectedSongDrawConflict = {
  roundNumber: RoundNumber;
  setOrder: 1 | 2;
  displayLabel: string;
  chartId: string;
  chartName: string;
  songKey: string;
  selectedInRoundNumber: RoundNumber;
};

export function selectedSongKeysFromResults(results: readonly RoundResultSnapshot[]) {
  return [
    ...new Set(results.flatMap((result) => result.sets.map((set) => set.selectedChart.songKey))),
  ].sort();
}

export function selectedSongBlocksFromResultsBeforeRound(
  results: readonly RoundResultSnapshot[],
  roundNumber: RoundNumber,
) {
  const blocks = new Map<string, PriorSelectedSongBlock>();

  for (const result of results) {
    if (result.roundNumber >= roundNumber) {
      continue;
    }

    for (const set of result.sets) {
      const selected = set.selectedChart;

      if (!blocks.has(selected.songKey)) {
        blocks.set(selected.songKey, {
          songKey: selected.songKey,
          selectedInRoundNumber: result.roundNumber,
          chartId: selected.id,
          chartName: selected.name,
        });
      }
    }
  }

  return [...blocks.values()].sort(
    (left, right) =>
      left.selectedInRoundNumber - right.selectedInRoundNumber ||
      left.chartName.localeCompare(right.chartName) ||
      left.songKey.localeCompare(right.songKey),
  );
}

export function selectedSongBlocksFromResultStoreBeforeRound(
  resultStore: ResultStore,
  roundNumber: RoundNumber,
) {
  return selectedSongBlocksFromResultsBeforeRound(resultStore.exportSnapshot().results, roundNumber);
}

export function findPriorSelectedSongDrawConflicts(input: {
  roundNumber: RoundNumber;
  draws: readonly DrawRecord[];
  priorSelectedSongBlocks: readonly PriorSelectedSongBlock[];
}) {
  const blocksBySongKey = new Map(
    input.priorSelectedSongBlocks.map((block) => [block.songKey, block]),
  );
  const conflicts: PriorSelectedSongDrawConflict[] = [];

  for (const draw of input.draws) {
    if (draw.roundNumber !== input.roundNumber || draw.supersededAt) {
      continue;
    }

    for (const chart of draw.charts) {
      const block = blocksBySongKey.get(chart.songKey);

      if (!block) {
        continue;
      }

      conflicts.push({
        roundNumber: draw.roundNumber,
        setOrder: draw.setOrder,
        displayLabel: draw.displayLabel,
        chartId: chart.id,
        chartName: chart.name,
        songKey: chart.songKey,
        selectedInRoundNumber: block.selectedInRoundNumber,
      });
    }
  }

  return conflicts.sort(
    (left, right) =>
      left.roundNumber - right.roundNumber ||
      left.setOrder - right.setOrder ||
      left.chartName.localeCompare(right.chartName) ||
      left.chartId.localeCompare(right.chartId),
  );
}

export function assertNoPriorSelectedSongDrawConflicts(
  input: Parameters<typeof findPriorSelectedSongDrawConflicts>[0],
) {
  const conflicts = findPriorSelectedSongDrawConflicts(input);

  if (conflicts.length === 0) {
    return;
  }

  const firstConflict = conflicts[0] as PriorSelectedSongDrawConflict;

  throw new Error(
    `Round ${firstConflict.roundNumber} ${firstConflict.displayLabel} includes ${firstConflict.chartName}, which was selected in Round ${firstConflict.selectedInRoundNumber}. Reroll or reset the affected future draw before opening voting or computing results.`,
  );
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
