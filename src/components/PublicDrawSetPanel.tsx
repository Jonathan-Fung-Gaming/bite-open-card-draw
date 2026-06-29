import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawRecord } from "@/lib/draw/draw-state";
import type { RoundSetDefinition } from "@/lib/tournament";

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
        <p className="text-sm text-metal-300">
          {draw ? `Version ${draw.version} / Pool ${draw.eligiblePoolCount}` : "Awaiting host draw"}
        </p>
      </div>
      {draw ? (
        <div className="public-chart-grid" data-testid="public-chart-card-row">
          {draw.charts.map((chart, index) => {
            const imagePath = chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH;

            return (
              <article
                key={chart.id}
                className="relative min-h-40 overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight"
                data-chart-image-path={imagePath}
                data-testid="stage-chart-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePath}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-55"
                  data-testid="stage-chart-image"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10" />
                <div className="relative flex min-h-40 flex-col justify-between p-3">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-ember-300">
                    <span>{chart.displayDifficulty}</span>
                    <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-lg font-black uppercase leading-tight text-white">
                      {chart.name}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-sm text-metal-300">{chart.artist}</p>
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
