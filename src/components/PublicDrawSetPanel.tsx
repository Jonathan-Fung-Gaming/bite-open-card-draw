import type { PublicChartsDraw, PublicChartsSetDefinition } from "@/lib/charts/public-chart-view";
import { ChartCardVisual } from "./ChartCardVisual";

type PublicDrawSetPanelProps = {
  set: PublicChartsSetDefinition;
  draw: PublicChartsDraw | null;
};

export function PublicDrawSetPanel({ set, draw }: PublicDrawSetPanelProps) {
  return (
    <section
      className="metal-panel rounded-lg p-4"
      data-set-order={set.setOrder}
      data-testid="stage-set-row"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Set {set.setOrder} / {set.drawCount} charts
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">
            Round {set.roundNumber} - {set.displayLabel}
          </h2>
        </div>
        {!draw ? <p className="text-sm text-metal-300">Awaiting host draw</p> : null}
      </div>
      {draw ? (
        <div className="public-chart-grid" data-testid="public-chart-card-row">
          {draw.charts.map((chart) => {
            return (
              <article
                key={chart.id}
                className="overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight"
                data-chart-image-path={chart.imagePath}
                data-testid="stage-chart-card"
              >
                <ChartCardVisual
                  artist={chart.artist}
                  imagePath={chart.imagePath}
                  name={chart.name}
                  variant="view-only"
                />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded border border-metal-700 bg-black/25 p-4 text-sm font-bold text-metal-300">
          This set has not been drawn yet.
        </div>
      )}
    </section>
  );
}
