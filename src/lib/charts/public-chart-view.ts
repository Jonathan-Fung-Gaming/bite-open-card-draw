import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import { getStageVisibleCardCount } from "@/lib/stage/stage-view";
import type { RoundSetDefinition } from "@/lib/tournament";

export type PublicChartsSetDefinition = Pick<
  RoundSetDefinition,
  "displayLabel" | "drawCount" | "roundNumber" | "setOrder"
>;

export type PublicChartsChart = {
  artist: string;
  id: string;
  imagePath: string;
  name: string;
};

export type PublicChartsDraw = {
  charts: PublicChartsChart[];
};

export type PublicChartsSetView = {
  draw: PublicChartsDraw | null;
  revealStartsAt?: string | null;
  set: PublicChartsSetDefinition;
};

type PublicChartsSetInput = {
  draw: DrawRecord | null;
  revealStartsAt?: string | null;
  set: RoundSetDefinition;
};

export function filterPublicChartsDrawForReveal(
  view: PublicChartsSetView,
  options: { nowMs: number; showAllCharts: boolean },
): PublicChartsDraw | null {
  if (!view.draw) {
    return null;
  }

  if (options.showAllCharts) {
    return view.draw;
  }

  const visibleCount = getStageVisibleCardCount(
    view.draw.charts.length,
    view.revealStartsAt,
    options.nowMs,
  );

  return {
    charts: view.draw.charts.slice(0, visibleCount),
  };
}

export function toPublicChartsSetView({
  draw,
  revealStartsAt,
  set,
}: PublicChartsSetInput): PublicChartsSetView {
  const view: PublicChartsSetView = {
    set: {
      displayLabel: set.displayLabel,
      drawCount: set.drawCount,
      roundNumber: set.roundNumber,
      setOrder: set.setOrder,
    },
    draw: draw
      ? {
          charts: draw.charts.map((chart) => ({
            artist: chart.artist,
            id: chart.id,
            imagePath: chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH,
            name: chart.name,
          })),
        }
      : null,
  };

  if (revealStartsAt !== undefined) {
    view.revealStartsAt = revealStartsAt;
  }

  return view;
}

export function toPublicChartsSetViews(
  sets: readonly PublicChartsSetInput[],
): PublicChartsSetView[] {
  return sets.map(toPublicChartsSetView);
}
