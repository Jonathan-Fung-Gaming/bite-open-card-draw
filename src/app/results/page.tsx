import { ResultSetPanel, RoundHeader, StageDrawCard } from "@/components";
import { adminState } from "@/lib/server/admin-state";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  const roundNumber = 1;
  const result = adminState.resultStore.getRoundResult(roundNumber);

  if (!result || result.revealPhase !== "final") {
    return (
      <main className="min-h-screen">
        <RoundHeader title="Round 1 Results" status="Awaiting stage reveal" />
        <section className="mx-auto max-w-3xl px-5 py-5">
          <div className="metal-panel rounded-lg p-5 text-center text-lg font-bold text-metal-300">
            <p>Voting is closed.</p>
            <p>Results are being revealed on stage.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <RoundHeader title={`ROUND ${roundNumber} FINAL CHARTS`} status="Results revealed" />
      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-5">
        <div className="grid gap-4 md:grid-cols-2">
          {result.sets.map((set, index) => (
            <StageDrawCard key={set.roundSetId} chart={set.selectedChart} index={index + 1} />
          ))}
        </div>
        <div className="grid gap-5">
          {result.sets.map((set) => (
            <ResultSetPanel key={set.roundSetId} set={set} showWinner />
          ))}
        </div>
      </section>
    </main>
  );
}
