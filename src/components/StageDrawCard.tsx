import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-paths";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";

type StageDrawCardProps = {
  chart?: DrawnChartSummary;
  index: number;
  variant?: "standard" | "featured";
};

export function StageDrawCard({ chart, index, variant = "standard" }: StageDrawCardProps) {
  const featured = variant === "featured";

  return (
    <article
      className={clsx(
        "stage-card relative overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight",
        featured ? "min-h-[min(58vh,34rem)]" : "min-h-20 2xl:min-h-44",
        chart && "border-ember-300/45",
      )}
      data-has-chart={chart ? "true" : "false"}
      data-testid="stage-chart-card"
    >
      <div className="absolute inset-0 bg-steel-lines" />
      {chart ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          data-testid="stage-chart-image"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
      <div
        className={clsx(
          "relative flex h-full flex-col justify-between",
          featured ? "min-h-[min(58vh,34rem)] p-5" : "min-h-20 p-2 2xl:min-h-44 2xl:p-3",
        )}
      >
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-ember-300">
          <span>{chart?.displayDifficulty ?? "LOCKED"}</span>
          <span className="font-mono">{String(index).padStart(2, "0")}</span>
        </div>
        <div>
          <h3
            className={clsx(
              "line-clamp-2 font-black uppercase leading-tight text-white",
              featured ? "text-4xl xl:text-5xl" : "text-xs lg:text-sm 2xl:text-lg",
            )}
          >
            {chart?.name ?? "Awaiting Draw"}
          </h3>
          <p className={clsx("mt-1 line-clamp-1 text-metal-300", featured ? "text-xl" : "text-sm")}>
            {chart?.artist ?? "Host control pending"}
          </p>
        </div>
      </div>
    </article>
  );
}
