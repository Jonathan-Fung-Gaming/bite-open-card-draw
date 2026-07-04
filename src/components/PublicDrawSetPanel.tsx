import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";
import { ChartArtImage } from "./ChartArtImage";

type PublicDrawSetPanelProps = {
  set: RoundSetDefinition;
  draw: DrawRecord | null;
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
        <p className="text-sm text-metal-300">{draw ? "Draw complete" : "Awaiting host draw"}</p>
      </div>
      {draw ? (
        <div className="public-chart-grid" data-testid="public-chart-card-row">
          {draw.charts.map((chart, index) => {
            const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

            return (
              <article
                key={chart.id}
                className="overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight"
                data-chart-image-path={imagePath}
                data-testid="stage-chart-card"
              >
                <div className="relative aspect-[16/9] overflow-hidden border-b border-ember-300/15 bg-black/35">
                  <ChartArtImage
                    src={imagePath}
                    className="h-full w-full object-contain opacity-95"
                  />
                </div>
                <div className="flex min-h-28 flex-col justify-between p-3">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-ember-300">
                    <span data-testid="chart-card-difficulty">{chart.displayDifficulty}</span>
                    <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <h3
                      className="mt-3 break-words text-base font-black uppercase leading-tight text-white sm:text-lg"
                      data-testid="chart-card-title"
                    >
                      {chart.name}
                    </h3>
                    <p className="mt-1 break-words text-sm text-metal-300" data-testid="chart-card-artist">
                      {chart.artist}
                    </p>
                  </div>
                </div>
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
