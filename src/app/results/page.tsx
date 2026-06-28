import { ChartCard, RoundHeader } from "@/components";
import { PLACEHOLDER_CHARTS } from "@/lib/tournament";

export default function ResultsPage() {
  const selectedCharts = [PLACEHOLDER_CHARTS[0], PLACEHOLDER_CHARTS[7]];

  return (
    <main className="min-h-screen">
      <RoundHeader title="Round 1 Final Charts" status="Results display shell" />
      <section className="mx-auto max-w-6xl px-5 py-5">
        <div className="metal-panel rounded-lg p-5">
          <p className="text-center text-lg font-bold text-metal-300">
            Voting is closed. Results are being revealed on stage.
          </p>
          <div className="rune-divider my-5" />
          <div className="grid gap-4 md:grid-cols-2">
            {selectedCharts.map((chart, index) => (
              <ChartCard key={chart.id} chart={chart} index={index + 1} selected />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
