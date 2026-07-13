import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";
import { ChartArtImage } from "./ChartArtImage";

type StageDrawCardProps = {
  animateReveal?: boolean;
  chart?: DrawnChartSummary;
  variant?: "standard" | "featured";
};

export function StageDrawCard({
  animateReveal = true,
  chart,
  variant = "standard",
}: StageDrawCardProps) {
  const featured = variant === "featured";

  return (
    <article
      className={clsx(
        "stage-card relative overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight",
        featured
          ? "min-h-[min(58vh,34rem)]"
          : "min-h-[clamp(5.625rem,12.5vh,9.25rem)] 2xl:min-h-44",
        chart && "border-ember-300/45",
        chart && animateReveal && "stage-card-revealed",
      )}
      data-animate-reveal={chart && animateReveal ? "true" : "false"}
      data-chart-image-path={chart?.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
      data-has-chart={chart ? "true" : "false"}
      data-testid="stage-chart-card"
    >
      <div className="absolute inset-0 bg-steel-lines" />
      {chart ? (
        <ChartArtImage
          src={chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
          loading={featured ? "eager" : "lazy"}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
      <div
        className={clsx(
          "relative flex h-full flex-col justify-between",
          featured
            ? "min-h-[min(58vh,34rem)] p-5"
            : "min-h-[clamp(5.625rem,12.5vh,9.25rem)] p-2.5 2xl:min-h-44 2xl:p-3",
        )}
      >
        <div className={featured ? "min-h-6" : "min-h-3"} />
        <div>
          <h3
            className={clsx(
              "line-clamp-2 break-words font-black uppercase leading-tight text-white",
              featured ? "text-4xl xl:text-5xl" : "text-sm lg:text-base 2xl:text-lg",
            )}
            data-testid="stage-chart-title"
          >
            {chart?.name ?? "Awaiting Draw"}
          </h3>
          <p
            className={clsx(
              "mt-1 line-clamp-1 break-words text-metal-300",
              featured ? "text-xl" : "text-xs lg:text-sm",
            )}
            data-testid="stage-chart-artist"
          >
            {chart?.artist ?? "Host control pending"}
          </p>
        </div>
      </div>
    </article>
  );
}
