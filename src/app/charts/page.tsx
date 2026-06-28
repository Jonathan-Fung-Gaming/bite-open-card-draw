import { ChartSetPanel, RoundHeader } from "@/components";
import { getPlaceholderChartsForSet, getSetsForRound } from "@/lib/tournament";

export default function ChartsPage() {
  const sets = getSetsForRound(1);

  return (
    <main className="min-h-screen">
      <RoundHeader title="Drawn Charts" status="View-only chart display" />
      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 lg:grid-cols-2">
        {sets.map((set) => (
          <ChartSetPanel
            key={set.displayLabel}
            set={set}
            charts={getPlaceholderChartsForSet(set.displayLabel)}
            compact
          />
        ))}
      </section>
    </main>
  );
}
