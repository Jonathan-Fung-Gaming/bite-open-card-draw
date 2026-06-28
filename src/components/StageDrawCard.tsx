import clsx from "clsx";
import { FALLBACK_CHART_IMAGE_PATH } from "@/lib/charts/image-cache";
import type { DrawnChartSummary } from "@/lib/draw/draw-engine";

type StageDrawCardProps = {
  chart?: DrawnChartSummary;
  index: number;
  revealDelayMs?: number;
};

export function StageDrawCard({ chart, index, revealDelayMs = 0 }: StageDrawCardProps) {
  return (
    <article
      className={clsx(
        "stage-card relative min-h-44 overflow-hidden rounded-md border border-ember-300/25 bg-furnace-900 shadow-ember-tight",
        chart && "stage-card-reveal",
      )}
      style={{ animationDelay: `${revealDelayMs}ms` }}
    >
      <div className="absolute inset-0 bg-steel-lines" />
      {chart ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={chart.localImagePath ?? FALLBACK_CHART_IMAGE_PATH}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
      <div className="relative flex h-full min-h-44 flex-col justify-between p-3">
        <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-ember-300">
          <span>{chart?.displayDifficulty ?? "LOCKED"}</span>
          <span className="font-mono">{String(index).padStart(2, "0")}</span>
        </div>
        <div>
          <h3 className="line-clamp-2 text-lg font-black uppercase leading-tight text-white">
            {chart?.name ?? "Awaiting Draw"}
          </h3>
          <p className="mt-1 line-clamp-1 text-sm text-metal-300">{chart?.artist ?? "Host control pending"}</p>
        </div>
      </div>
    </article>
  );
}
