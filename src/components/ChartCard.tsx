import clsx from "clsx";
import type { PlaceholderChart } from "@/lib/tournament";

type ChartCardProps = {
  chart?: PlaceholderChart;
  index?: number;
  compact?: boolean;
  selected?: boolean;
};

export function ChartCard({ chart, index, compact = false, selected = false }: ChartCardProps) {
  return (
    <article
      className={clsx(
        "group relative overflow-hidden rounded-md border bg-furnace-900 shadow-ember-tight",
        "border-ember-300/20",
        selected && "border-ember-300 shadow-ember",
        compact ? "min-h-36 p-3" : "min-h-48 p-4",
      )}
    >
      <div className="absolute inset-0 bg-steel-lines opacity-80" />
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-ember-500 to-transparent" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-ember-300">
          <span>{chart?.difficulty ?? "SET"}</span>
          <span className="font-mono text-metal-300">{index ? String(index).padStart(2, "0") : "00"}</span>
        </div>
        <div>
          <div className="mb-3 h-14 rounded border border-ember-300/15 bg-black/30 shadow-inner">
            <div className="flex h-full items-center justify-center text-xl font-black text-ember-300/55">
              {chart ? "BITE" : "LOCKED"}
            </div>
          </div>
          <h3 className={clsx("font-black uppercase leading-tight", compact ? "text-base" : "text-xl")}>
            {chart?.title ?? "Awaiting Draw"}
          </h3>
          <p className="mt-1 text-sm text-metal-300">{chart?.artist ?? "Server draw pending"}</p>
        </div>
        <div className="rune-divider" />
      </div>
    </article>
  );
}
