import "server-only";

import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundBallot } from "@/lib/vote/ballot";

export type AdminLiveCountSet = {
  id: string;
  displayLabel: string;
  rows: Array<{
    id: string;
    name: string;
    banCount: number;
  }>;
};

export function buildAdminLiveCountRows(
  draws: readonly DrawRecord[],
  ballots: readonly RoundBallot[],
): AdminLiveCountSet[] {
  return draws.map((draw) => ({
    id: draw.id,
    displayLabel: draw.displayLabel,
    rows: draw.charts.map((chart) => {
      const banCount = ballots.reduce((total, ballot) => {
        const choice = ballot.choices.find((candidate) => candidate?.drawId === draw.id);

        return total + (choice?.bannedChartIds.includes(chart.id) ? 1 : 0);
      }, 0);

      return {
        id: chart.id,
        name: chart.name,
        banCount,
      };
    }),
  }));
}
