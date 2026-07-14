import type { PublicChartsDraw, PublicChartsSetDefinition } from "@/lib/charts/public-chart-view";
import { ChartCardVisual } from "./ChartCardVisual";

type PublicDrawSetPanelProps = {
  compactMobile?: boolean;
  set: PublicChartsSetDefinition;
  draw: PublicChartsDraw | null;
  revealStatus?: string | null;
};

export function PublicDrawSetPanel({
  compactMobile = false,
  draw,
  revealStatus,
  set,
}: PublicDrawSetPanelProps) {
  const slots = draw
    ? Array.from({ length: set.drawCount }, (_, index) => draw.charts[index] ?? null)
    : [];
  const status = revealStatus ?? (!draw ? "Awaiting host draw" : null);

  return (
    <section
      className={
        compactMobile ? "metal-panel rounded-lg p-1.5 md:p-4" : "metal-panel rounded-lg p-4"
      }
      data-set-order={set.setOrder}
      data-testid="stage-set-row"
    >
      <div
        className={
          compactMobile
            ? "mb-1 flex flex-wrap items-end justify-between gap-1 md:mb-4 md:gap-3"
            : "mb-4 flex flex-wrap items-end justify-between gap-3"
        }
      >
        <div>
          <p
            className={
              compactMobile
                ? "text-[9px] font-semibold uppercase tracking-[0.16em] text-ember-300 md:text-xs md:tracking-[0.22em]"
                : "text-xs font-semibold uppercase tracking-[0.22em] text-ember-300"
            }
          >
            Set {set.setOrder} / {set.drawCount} charts
          </p>
          <h2
            className={
              compactMobile
                ? "mt-0.5 text-xs font-black uppercase text-white md:mt-1 md:text-2xl"
                : "mt-1 text-2xl font-black uppercase text-white"
            }
          >
            Round {set.roundNumber} - {set.displayLabel}
          </h2>
        </div>
        {status ? (
          <p
            className={
              compactMobile ? "text-[10px] text-metal-300 md:text-sm" : "text-sm text-metal-300"
            }
          >
            {status}
          </p>
        ) : null}
      </div>
      {draw ? (
        <div
          className={
            compactMobile ? "public-chart-grid public-chart-grid--compact" : "public-chart-grid"
          }
          data-testid="public-chart-card-row"
        >
          {slots.map((chart, index) => {
            return (
              <article
                key={chart?.id ?? `pending-${set.setOrder}-${index}`}
                className="overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight"
                data-chart-image-path={chart?.imagePath}
                data-has-chart={chart ? "true" : "false"}
                data-testid="stage-chart-card"
              >
                {chart ? (
                  <ChartCardVisual
                    artist={chart.artist}
                    compact={compactMobile}
                    imagePath={chart.imagePath}
                    name={chart.name}
                    variant="view-only"
                  />
                ) : (
                  <div
                    className={
                      compactMobile
                        ? "grid min-h-[82px] place-items-center bg-black/35 px-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-metal-500 md:min-h-28 md:px-2 md:text-xs"
                        : "grid min-h-36 place-items-center bg-black/35 px-2 text-center text-xs font-black uppercase tracking-[0.14em] text-metal-500 md:min-h-28"
                    }
                  >
                    Revealing soon
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className={
            compactMobile
              ? "rounded border border-metal-700 bg-black/25 p-3 text-xs font-bold text-metal-300 md:p-4 md:text-sm"
              : "rounded border border-metal-700 bg-black/25 p-4 text-sm font-bold text-metal-300"
          }
        >
          This set has not been drawn yet.
        </div>
      )}
    </section>
  );
}
