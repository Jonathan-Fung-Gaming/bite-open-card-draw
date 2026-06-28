import type { PlaceholderChart, RoundSetDefinition } from "@/lib/tournament";
import { ChartCard } from "./ChartCard";

type ChartSetPanelProps = {
  set: RoundSetDefinition;
  charts: readonly PlaceholderChart[];
  compact?: boolean;
};

export function ChartSetPanel({ set, charts, compact = false }: ChartSetPanelProps) {
  return (
    <section className="metal-panel rounded-lg p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ember-300">
            Round {set.roundNumber} - Set {set.setOrder}
          </p>
          <h2 className="mt-1 text-2xl font-black uppercase text-white">{set.displayLabel}</h2>
        </div>
        <p className="text-sm text-metal-300">
          {set.drawCount} charts / max {set.maxBans} bans
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {charts.slice(0, set.drawCount).map((chart, index) => (
          <ChartCard key={chart.id} chart={chart} index={index + 1} compact={compact} />
        ))}
      </div>
    </section>
  );
}
