import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";

export type PublicChartsSetDefinition = Pick<
  RoundSetDefinition,
  "displayLabel" | "drawCount" | "roundNumber" | "setOrder"
>;

export type PublicChartsChart = {
  artist: string;
  displayDifficulty: string;
  id: string;
  imagePath: string;
  name: string;
  order: number;
};

export type PublicChartsDraw = {
  charts: PublicChartsChart[];
};

export type PublicChartsSetView = {
  draw: PublicChartsDraw | null;
  set: PublicChartsSetDefinition;
};

type PublicChartsSetInput = {
  draw: DrawRecord | null;
  set: RoundSetDefinition;
};

export function toPublicChartsSetView({ draw, set }: PublicChartsSetInput): PublicChartsSetView {
  return {
    set: {
      displayLabel: set.displayLabel,
      drawCount: set.drawCount,
      roundNumber: set.roundNumber,
      setOrder: set.setOrder,
    },
    draw: draw
      ? {
          charts: draw.charts.map((chart, index) => ({
            artist: chart.artist,
            displayDifficulty: chart.displayDifficulty,
            id: chart.id,
            imagePath: chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH,
            name: chart.name,
            order: index + 1,
          })),
        }
      : null,
  };
}

export function toPublicChartsSetViews(
  sets: readonly PublicChartsSetInput[],
): PublicChartsSetView[] {
  return sets.map(toPublicChartsSetView);
}
