import { ChartSetPanel, CountdownTimer, QRPanel, RoundHeader } from "@/components";
import { getPlaceholderChartsForSet, getSetsForRound } from "@/lib/tournament";

export default function StagePage() {
  const sets = getSetsForRound(1);

  return (
    <main className="min-h-screen">
      <RoundHeader title="Round 1 Draw" status="Stage display ready" />
      <section className="grid gap-5 px-5 py-5 lg:grid-cols-[1fr_280px] lg:px-8">
        <div className="grid gap-5">
          {sets.map((set) => (
            <ChartSetPanel
              key={set.displayLabel}
              set={set}
              charts={getPlaceholderChartsForSet(set.displayLabel)}
              compact
            />
          ))}
        </div>
        <aside className="grid content-start gap-5">
          <CountdownTimer label="Voting Window" minutes="10:00" caption="Standby" />
          <QRPanel />
        </aside>
      </section>
    </main>
  );
}
